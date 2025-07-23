
// -------------------- IMPORTS --------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  arrayUnion,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// -------------------- CONFIG --------------------
const firebaseConfig = {
  apiKey: "AIzaSyDG1xj3HzkxuYXS1pl1mK-jN3xctgSQ4Xs",
  authDomain: "fratelli-pazzi-pizzeria.firebaseapp.com",
  projectId: "fratelli-pazzi-pizzeria",
  storageBucket: "fratelli-pazzi-pizzeria.firebasestorage.app",
  messagingSenderId: "391760015146",
  appId: "1:391760015146:web:24a265cabeefbff2187853"
};

// -------------------- INIT --------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -------------------- REWARDS CONFIG --------------------
const REWARDS_CONFIG = {
  pointsPerEuro: 10,
  welcomeBonus: 100,
  emailVerificationBonus: 50,
  reviewBonus: 25,
  levelUpBonus: 50,
  rewardCosts: {
    bebida: 300,
    pizza: 1000,
    calzone: 1500,
    combo: 2500,
    camiseta: 5000,
    cena: 10000
  },
  userLevels: {
    'Principiante': { minPoints: 0, color: '#80AF7A', icon: '🍕' },
    'Aficionado': { minPoints: 500, color: '#D5786C', icon: '🍅' },
    'Experto': { minPoints: 1500, color: '#cdb87c', icon: '👨‍🍳' },
    'Maestro Pizzero': { minPoints: 3000, color: '#253732', icon: '👑' }
  }
};

// -------------------- SERVICE CLASS --------------------
class FirebaseService {
  constructor() {
    this.auth = auth;
    this.db = db;
    this.rewardsConfig = REWARDS_CONFIG;
    console.log('🔥 Firebase Service with Rewards initialized');
  }

  // ===== AUTH =====
  async signIn(email, password) {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);
      await this.loadUserRewards(cred.user.uid);
      return { success: true, user: cred.user };
    } catch (error) {
      console.error('❌ Sign in error:', error);
      return { success: false, error };
    }
  }

  async signUp(email, password, userData = {}) {
    try {
      const cred = await createUserWithEmailAndPassword(this.auth, email, password);

      if (userData.name) {
        try { await updateProfile(cred.user, { displayName: userData.name }); } catch (e) { console.warn('⚠️ profile update', e); }
      }

      await this.sendEmailVerification(cred.user);

      const nowIso = new Date().toISOString();

      await this.saveUserData(cred.user.uid, {
        name: userData.name || null,
        email,
        phone: userData.phone || null,
        acceptsOffers: userData.acceptsOffers || false,
        registeredAt: nowIso,
        emailVerified: false,
        hasUsedWelcomeDiscount: false,
        // Rewards initial data
        points: this.rewardsConfig.welcomeBonus,
        totalPointsEarned: this.rewardsConfig.welcomeBonus,
        totalPointsSpent: 0,
        level: 'Principiante',
        orders: [],
        rewardsHistory: [
          {
            type: 'earned',
            points: this.rewardsConfig.welcomeBonus,
            reason: 'Bonus de bienvenida',
            date: nowIso
          }
        ],
        favoritos: [],
        redeemedRewards: []
      });

      await this.loadUserRewards(cred.user.uid);
      return { success: true, user: cred.user };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      return { success: false, error };
    }
  }

  async signOut() {
    try {
      await signOut(this.auth);
      sessionStorage.removeItem('userRewards');
      return { success: true };
    } catch (error) {
      console.error('❌ Sign out error:', error);
      return { success: false, error };
    }
  }

  // ===== REWARDS CORE =====
  async loadUserRewards(uid) {
    try {
      const res = await this.getUserData(uid);
      if (res.success && res.data) {
        const rewards = {
          points: res.data.points || 0,
          level: res.data.level || 'Principiante',
          totalPointsEarned: res.data.totalPointsEarned || 0,
          totalPointsSpent: res.data.totalPointsSpent || 0,
          rewardsHistory: res.data.rewardsHistory || []
        };
        sessionStorage.setItem('userRewards', JSON.stringify(rewards));
        return { success: true, rewards };
      }
      return { success: false, error: 'No user data found' };
    } catch (error) {
      console.error('❌ loadUserRewards error:', error);
      return { success: false, error };
    }
  }

  async addPoints(uid, points, reason, orderId = null, skipLevelCheck = false) {
    const userRef = doc(this.db, 'users', uid);
    const nowIso = new Date().toISOString();

    try {
      await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Usuario no encontrado');

        const data = snap.data();
        const newPoints = (data.points || 0) + points;
        const newTotalEarned = (data.totalPointsEarned || 0) + points;
        const newHistory = arrayUnion({
          type: 'earned',
          points,
          reason,
          date: nowIso,
          orderId
        });

        tx.update(userRef, {
          points: newPoints,
          totalPointsEarned: newTotalEarned,
          rewardsHistory: newHistory
        });
      });

      // cache
      this._bumpCache(points, 'earned');

      if (!skipLevelCheck) await this.checkLevelUp(uid);

      console.log(`🎁 Added ${points} points to ${uid} (${reason})`);
      return { success: true };
    } catch (error) {
      console.error('❌ addPoints error:', error);
      return { success: false, error };
    }
  }

  async spendPoints(uid, pointsToSpend, reason, rewardData = null) {
    const userRef = doc(this.db, 'users', uid);
    const nowIso = new Date().toISOString();

    try {
      const remainingPoints = await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Usuario no encontrado');
        const data = snap.data();
        const currentPoints = data.points || 0;
        if (currentPoints < pointsToSpend) throw new Error('Puntos insuficientes');

        const newPoints = currentPoints - pointsToSpend;
        const newTotalSpent = (data.totalPointsSpent || 0) + pointsToSpend;

        tx.update(userRef, {
          points: newPoints,
          totalPointsSpent: newTotalSpent,
          rewardsHistory: arrayUnion({
            type: 'spent',
            points: pointsToSpend,
            reason,
            date: nowIso,
            rewardData
          })
        });
        return newPoints;
      });

      // cache
      this._bumpCache(-pointsToSpend, 'spent');

      console.log(`💰 ${uid} spent ${pointsToSpend} points (${reason})`);
      return { success: true, remainingPoints };
    } catch (error) {
      console.error('❌ spendPoints error:', error);
      return { success: false, error: error.message || error };
    }
  }

  async checkLevelUp(uid) {
    try {
      const { success, data } = await this.getUserData(uid);
      if (!success) return { leveledUp: false };

      const totalPoints = data.totalPointsEarned || 0;
      const currentLevel = data.level || 'Principiante';

      let newLevel = 'Principiante';
      for (const [lvl, cfg] of Object.entries(this.rewardsConfig.userLevels)) {
        if (totalPoints >= cfg.minPoints) newLevel = lvl;
      }

      if (newLevel !== currentLevel) {
        await updateDoc(doc(this.db, 'users', uid), { level: newLevel });
        // bonus, but skip recursion checkLevelUp
        await this.addPoints(uid, this.rewardsConfig.levelUpBonus, `¡Subiste a nivel ${newLevel}!`, null, true);
        console.log(`🎉 Level up: ${uid} -> ${newLevel}`);
        return { leveledUp: true, newLevel };
      }
      return { leveledUp: false, currentLevel };
    } catch (error) {
      console.error('❌ checkLevelUp error:', error);
      return { leveledUp: false };
    }
  }

  calculateOrderPoints(orderTotal) {
    return Math.floor(orderTotal * this.rewardsConfig.pointsPerEuro);
  }

  getAvailableRewards(userPoints) {
    return Object.entries(this.rewardsConfig.rewardCosts).map(([type, cost]) => ({
      type,
      pointsCost: cost,
      canAfford: userPoints >= cost,
      pointsNeeded: userPoints < cost ? cost - userPoints : 0
    }));
  }

  getUserLevel(totalPoints) {
    let level = 'Principiante';
    for (const [name, cfg] of Object.entries(this.rewardsConfig.userLevels)) {
      if (totalPoints >= cfg.minPoints) level = name;
    }
    return { name: level, ...this.rewardsConfig.userLevels[level] };
  }

  // ===== ORDERS =====
  async processOrderWithRewards(uid, orderData) {
    try {
      const pointsEarned = this.calculateOrderPoints(orderData.total);
      const order = {
        ...orderData,
        orderId: 'ORD_' + Date.now(),
        userId: uid,
        date: new Date().toISOString(),
        pointsEarned,
        status: 'confirmed'
      };

      const userRef = doc(this.db, 'users', uid);
      await updateDoc(userRef, {
        orders: arrayUnion(order)
      });

      await this.addPoints(uid, pointsEarned, `Compra - Orden ${order.orderId}`, order.orderId);

      return { success: true, order, pointsEarned };
    } catch (error) {
      console.error('❌ processOrderWithRewards error:', error);
      return { success: false, error };
    }
  }

  // ===== EMAIL VERIFICATION BONUS =====
  async processEmailVerification(uid) {
    try {
      await this.addPoints(uid, this.rewardsConfig.emailVerificationBonus, 'Email verificado');
      await updateDoc(doc(this.db, 'users', uid), {
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString()
      });
      return { success: true };
    } catch (error) {
      console.error('❌ processEmailVerification error:', error);
      return { success: false, error };
    }
  }

  // ===== OTHER AUTH HELPERS =====
  async sendEmailVerification(user = null, actionCodeSettings = null) {
    try {
      const target = user || this.auth.currentUser;
      if (!target) throw new Error('No user available');
      const defaultSettings = {
        url: `${window.location.origin}?emailVerified=true`,
        handleCodeInApp: false
      };
      await sendEmailVerification(target, actionCodeSettings || defaultSettings);
      return { success: true };
    } catch (error) {
      console.error('❌ sendEmailVerification error:', error);
      return { success: false, error };
    }
  }

  async sendPasswordReset(email) {
    try {
      await sendPasswordResetEmail(this.auth, email);
      return { success: true };
    } catch (error) {
      console.error('❌ sendPasswordReset error:', error);
      return { success: false, error };
    }
  }

  async refreshUserEmailStatus() {
    const user = this.auth.currentUser;
    if (!user) return { success: false, error: 'No current user' };
    try {
      await user.reload();
      const verified = user.emailVerified;
      if (verified) {
        const { success, data } = await this.getUserData(user.uid);
        if (success && data && !data.emailVerified) {
          await this.processEmailVerification(user.uid);
        }
      }
      return { success: true, emailVerified: verified };
    } catch (error) {
      console.error('❌ refreshUserEmailStatus error:', error);
      return { success: false, error };
    }
  }

  // ===== FIRESTORE CRUD =====
  async saveUserData(uid, userData) {
    try {
      await setDoc(doc(this.db, 'users', uid), userData);
      return { success: true };
    } catch (error) {
      console.error('❌ saveUserData error:', error);
      return { success: false, error };
    }
  }

  async updateUserData(uid, updates) {
    try {
      await setDoc(doc(this.db, 'users', uid), updates, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('❌ updateUserData error:', error);
      return { success: false, error };
    }
  }

  async getUserData(uid) {
    try {
      const snap = await getDoc(doc(this.db, 'users', uid));
      if (snap.exists()) return { success: true, data: snap.data() };
      return { success: false, error: 'No user document found' };
    } catch (error) {
      console.error('❌ getUserData error:', error);
      return { success: false, error };
    }
  }

  onAuthStateChanged(callback) {
    return onAuthStateChanged(this.auth, async (user) => {
      if (user) await this.loadUserRewards(user.uid); else sessionStorage.removeItem('userRewards');
      callback(user);
    });
  }

  // ===== UTILS =====
  getCurrentUser() { return this.auth.currentUser; }
  isUserSignedIn() { return !!this.auth.currentUser; }
  isEmailVerified() { return this.auth.currentUser?.emailVerified || false; }
  getCurrentUserRewards() {
    const r = sessionStorage.getItem('userRewards');
    return r ? JSON.parse(r) : null;
  }

  getErrorMessage(error) {
    const map = {
      'auth/email-already-in-use': 'Ya existe una cuenta con este email',
      'auth/invalid-email': 'El formato del email no es válido',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
      'auth/user-not-found': 'No existe una cuenta con este email',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos',
      'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
      'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
      'auth/operation-not-allowed': 'Operación no permitida'
    };
    return map[error.code] || error.message || 'Error desconocido';
  }

  // === private helper ===
  _bumpCache(deltaPoints, type) {
    const cache = JSON.parse(sessionStorage.getItem('userRewards') || '{}');
    cache.points = (cache.points || 0) + deltaPoints;
    if (type === 'earned') cache.totalPointsEarned = (cache.totalPointsEarned || 0) + deltaPoints;
    if (type === 'spent') cache.totalPointsSpent = (cache.totalPointsSpent || 0) + Math.abs(deltaPoints);
    sessionStorage.setItem('userRewards', JSON.stringify(cache));
  }
}

// -------------------- INSTANCE & EXPORTS --------------------
const firebaseService = new FirebaseService();
export { firebaseService as default, auth, db, REWARDS_CONFIG };

// Hacerlo global
window.firebaseService = firebaseService;

// -------------------- SIMPLE API PARA pedido.html --------------------
window.FratelliFirebaseAPI = {
  async addPointsAfterPurchase(orderTotal, orderId = null) {
    if (firebaseService.getCurrentUser()) {
      const pts = firebaseService.calculateOrderPoints(orderTotal);
      const res = await firebaseService.addPoints(
        firebaseService.getCurrentUser().uid,
        pts,
        `Compra - Pedido ${orderId || 'nuevo'}`,
        orderId
      );
      if (res.success) return { success: true, points: pts };
    }
    return { success: false, points: 0 };
  },
  getCurrentPoints() {
    const r = firebaseService.getCurrentUserRewards();
    return r ? r.points : 0;
  },
  isUserSignedIn() { return firebaseService.isUserSignedIn(); },
  getCurrentUser() { return firebaseService.getCurrentUser(); }
};

console.log(`\n🔥 FIREBASE SERVICE WITH ENHANCED REWARDS\n=========================================\n\n✅ Firebase Auth: Ready\n✅ Firestore: Ready\n✅ Enhanced Rewards: Ready\n✅ Service Class: window.firebaseService\n\n🎁 FEATURES:\n• ${REWARDS_CONFIG.pointsPerEuro} puntos por €\n• ${REWARDS_CONFIG.welcomeBonus} puntos de bienvenida\n• ${REWARDS_CONFIG.emailVerificationBonus} verificación email\n• ${REWARDS_CONFIG.levelUpBonus} bonus por nivel\n• Sistema de niveles y canje seguro\n\n🚀 Métodos clave:\n• firebaseService.addPoints(uid, points, reason)\n• firebaseService.spendPoints(uid, points, reason, rewardData)\n• firebaseService.processOrderWithRewards(uid, orderData)\n\n💻 API simple (pedido.html):\n• FratelliFirebaseAPI.addPointsAfterPurchase(total, orderId)\n• FratelliFirebaseAPI.getCurrentPoints()\n\n🍕 Listo para producción.\n`);
