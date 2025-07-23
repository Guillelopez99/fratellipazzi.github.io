// ========== FIREBASE CONFIGURATION & AUTHENTICATION ==========
// Firebase configuration and authentication module for Fratelli Pazzi with Rewards System

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, sendEmailVerification,
         sendPasswordResetEmail, signOut, updateProfile } 
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, increment, arrayUnion } 
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDG1xj3HzkxuYXS1pl1mK-jN3xctgSQ4Xs",
  authDomain: "fratelli-pazzi-pizzeria.firebaseapp.com",
  projectId: "fratelli-pazzi-pizzeria",
  storageBucket: "fratelli-pazzi-pizzeria.firebasestorage.app",
  messagingSenderId: "391760015146",
  appId: "1:391760015146:web:24a265cabeefbff2187853"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// REWARDS SYSTEM CONFIGURATION
const REWARDS_CONFIG = {
  pointsPerEuro: 10,           // 10 puntos por cada euro gastado
  welcomeBonus: 100,           // 100 puntos al registrarse
  emailVerificationBonus: 50,  // 50 puntos por verificar email
  reviewBonus: 25,             // 25 puntos por reseña
  levelUpBonus: 50,            // 50 puntos por subir de nivel
  
  // Costos de recompensas
  rewardCosts: {
    bebida: 300,
    pizza: 1000,
    calzone: 1500,
    combo: 2500,
    camiseta: 5000,
    cena: 10000
  },
  
  // Niveles de usuario
  userLevels: {
    'Principiante': { minPoints: 0, color: '#80AF7A', icon: '🍕' },
    'Aficionado': { minPoints: 500, color: '#D5786C', icon: '🍅' },
    'Experto': { minPoints: 1500, color: '#cdb87c', icon: '👨‍🍳' },
    'Maestro Pizzero': { minPoints: 3000, color: '#253732', icon: '👑' }
  }
};

// Firebase Service Class with Enhanced Rewards System
class FirebaseService {
  constructor() {
    this.auth = auth;
    this.db = db;
    this.isInitialized = true;
    this.rewardsConfig = REWARDS_CONFIG;
    
    console.log('🔥 Firebase Service with Enhanced Rewards System initialized');
  }

  // ========== AUTHENTICATION METHODS ==========
  
  async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      console.log('✅ User signed in:', userCredential.user.email);
      
      // Cargar datos de recompensas del usuario
      await this.loadUserRewards(userCredential.user.uid);
      
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('❌ Sign in error:', error);
      return { success: false, error: error };
    }
  }

  async signUp(email, password, userData = {}) {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      
      // Update profile with display name
      if (userData.name) {
        try {
          await updateProfile(userCredential.user, {
            displayName: userData.name
          });
        } catch (profileError) {
          console.error('⚠️ Error updating profile:', profileError);
        }
      }

      // Send email verification
      await this.sendEmailVerification(userCredential.user);

      // Save user data to Firestore with rewards
      await this.saveUserData(userCredential.user.uid, {
        name: userData.name,
        email: email,
        phone: userData.phone || null,
        acceptsOffers: userData.acceptsOffers || false,
        registeredAt: new Date().toISOString(),
        emailVerified: false,
        hasUsedWelcomeDiscount: false,
        
        // REWARDS DATA
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
            date: new Date().toISOString()
          }
        ],
        favoritos: [],
        redeemedRewards: []
      });

      console.log('✅ User registered with welcome bonus:', this.rewardsConfig.welcomeBonus);
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      return { success: false, error: error };
    }
  }

  async signOut() {
    try {
      await signOut(this.auth);
      // Limpiar datos de recompensas del sessionStorage
      sessionStorage.removeItem('userRewards');
      console.log('✅ User signed out');
      return { success: true };
    } catch (error) {
      console.error('❌ Sign out error:', error);
      return { success: false, error: error };
    }
  }

  // ========== REWARDS SYSTEM METHODS ==========
  
  async loadUserRewards(uid) {
    try {
      const userData = await this.getUserData(uid);
      if (userData.success && userData.data) {
        const rewards = {
          points: userData.data.points || 0,
          level: userData.data.level || 'Principiante',
          totalPointsEarned: userData.data.totalPointsEarned || 0,
          totalPointsSpent: userData.data.totalPointsSpent || 0,
          rewardsHistory: userData.data.rewardsHistory || []
        };
        
        // Guardar en sessionStorage para acceso rápido
        sessionStorage.setItem('userRewards', JSON.stringify(rewards));
        
        console.log('🎁 User rewards loaded:', rewards);
        return { success: true, rewards };
      }
      return { success: false, error: 'No user data found' };
    } catch (error) {
      console.error('❌ Error loading user rewards:', error);
      return { success: false, error: error };
    }
  }

  async addPoints(uid, points, reason, orderId = null) {
    try {
      const userRef = doc(this.db, 'users', uid);
      
      // Crear entrada en el historial
      const historyEntry = {
        type: 'earned',
        points: points,
        reason: reason,
        date: new Date().toISOString(),
        orderId: orderId
      };

      // Actualizar puntos y historial
      await updateDoc(userRef, {
        points: increment(points),
        totalPointsEarned: increment(points),
        rewardsHistory: arrayUnion(historyEntry)
      });

      // Verificar si el usuario subió de nivel
      await this.checkLevelUp(uid);

      // Actualizar sessionStorage
      const currentRewards = JSON.parse(sessionStorage.getItem('userRewards') || '{}');
      currentRewards.points = (currentRewards.points || 0) + points;
      currentRewards.totalPointsEarned = (currentRewards.totalPointsEarned || 0) + points;
      sessionStorage.setItem('userRewards', JSON.stringify(currentRewards));

      console.log(`🎁 Added ${points} points to user ${uid} for: ${reason}`);
      return { success: true, pointsAdded: points, newTotal: currentRewards.points };
    } catch (error) {
      console.error('❌ Error adding points:', error);
      return { success: false, error: error };
    }
  }

  async spendPoints(uid, pointsToSpend, reason, rewardData = null) {
    try {
      const userData = await this.getUserData(uid);
      if (!userData.success || !userData.data) {
        throw new Error('Usuario no encontrado');
      }

      const currentPoints = userData.data.points || 0;
      
      if (currentPoints < pointsToSpend) {
        throw new Error('Puntos insuficientes');
      }

      const userRef = doc(this.db, 'users', uid);
      
      // Crear entrada en el historial
      const historyEntry = {
        type: 'spent',
        points: pointsToSpend,
        reason: reason,
        date: new Date().toISOString(),
        rewardData: rewardData
      };

      // Actualizar datos del usuario
      await updateDoc(userRef, {
        points: increment(-pointsToSpend),
        totalPointsSpent: increment(pointsToSpend),
        rewardsHistory: arrayUnion(historyEntry)
      });

      // Actualizar sessionStorage
      const currentRewards = JSON.parse(sessionStorage.getItem('userRewards') || '{}');
      currentRewards.points = (currentRewards.points || 0) - pointsToSpend;
      currentRewards.totalPointsSpent = (currentRewards.totalPointsSpent || 0) + pointsToSpend;
      sessionStorage.setItem('userRewards', JSON.stringify(currentRewards));

      console.log(`💰 User ${uid} spent ${pointsToSpend} points for: ${reason}`);
      return { 
        success: true, 
        remainingPoints: currentRewards.points
      };
    } catch (error) {
      console.error('❌ Error spending points:', error);
      return { success: false, error: error.message };
    }
  }

  async checkLevelUp(uid) {
    try {
      const userData = await this.getUserData(uid);
      if (!userData.success || !userData.data) return;

      const totalPoints = userData.data.totalPointsEarned || 0;
      const currentLevel = userData.data.level || 'Principiante';
      
      let newLevel = 'Principiante';
      
      // Determinar nuevo nivel basado en puntos totales ganados
      for (const [level, config] of Object.entries(this.rewardsConfig.userLevels)) {
        if (totalPoints >= config.minPoints) {
          newLevel = level;
        }
      }

      // Si subió de nivel, actualizar
      if (newLevel !== currentLevel) {
        await updateDoc(doc(this.db, 'users', uid), {
          level: newLevel
        });

        // Bonus por subir de nivel
        const levelUpBonus = this.rewardsConfig.levelUpBonus;
        await this.addPoints(uid, levelUpBonus, `¡Subiste a nivel ${newLevel}!`);

        console.log(`🎉 User ${uid} leveled up to: ${newLevel}`);
        return { leveledUp: true, newLevel, bonus: levelUpBonus };
      }

      return { leveledUp: false, currentLevel: newLevel };
    } catch (error) {
      console.error('❌ Error checking level up:', error);
      return { leveledUp: false };
    }
  }

  calculateOrderPoints(orderTotal) {
    return Math.floor(orderTotal * this.rewardsConfig.pointsPerEuro);
  }

  getAvailableRewards(userPoints) {
    const available = [];
    
    for (const [type, cost] of Object.entries(this.rewardsConfig.rewardCosts)) {
      available.push({
        type: type,
        pointsCost: cost,
        canAfford: userPoints >= cost,
        pointsNeeded: userPoints < cost ? cost - userPoints : 0
      });
    }
    
    return available;
  }

  getUserLevel(totalPoints) {
    let level = 'Principiante';
    
    for (const [levelName, config] of Object.entries(this.rewardsConfig.userLevels)) {
      if (totalPoints >= config.minPoints) {
        level = levelName;
      }
    }
    
    return {
      name: level,
      ...this.rewardsConfig.userLevels[level]
    };
  }

  // ========== ENHANCED ORDER PROCESSING ==========
  
  async processOrderWithRewards(uid, orderData) {
    try {
      // Calcular puntos por la orden
      const pointsEarned = this.calculateOrderPoints(orderData.total);
      
      // Crear registro de orden completo
      const order = {
        ...orderData,
        orderId: 'ORD_' + Date.now(),
        userId: uid,
        date: new Date().toISOString(),
        pointsEarned: pointsEarned,
        status: 'confirmed'
      };

      // Agregar orden al historial del usuario
      const userRef = doc(this.db, 'users', uid);
      await updateDoc(userRef, {
        orders: arrayUnion(order)
      });

      // Agregar puntos por la compra
      await this.addPoints(uid, pointsEarned, `Compra - Orden ${order.orderId}`, order.orderId);

      console.log(`📦 Order processed for user ${uid}: ${pointsEarned} points earned`);
      return { 
        success: true, 
        order: order, 
        pointsEarned: pointsEarned 
      };
    } catch (error) {
      console.error('❌ Error processing order:', error);
      return { success: false, error: error };
    }
  }

  // ========== EMAIL VERIFICATION BONUS ==========
  
  async processEmailVerification(uid) {
    try {
      await this.addPoints(
        uid, 
        this.rewardsConfig.emailVerificationBonus, 
        'Email verificado'
      );
      
      await updateDoc(doc(this.db, 'users', uid), {
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString()
      });

      console.log(`📧 Email verification bonus added: ${this.rewardsConfig.emailVerificationBonus} points`);
      return { success: true, bonus: this.rewardsConfig.emailVerificationBonus };
    } catch (error) {
      console.error('❌ Error processing email verification:', error);
      return { success: false, error: error };
    }
  }

  // ========== EXISTING METHODS (UPDATED) ==========
  
  async sendEmailVerification(user = null, actionCodeSettings = null) {
    try {
      const targetUser = user || this.auth.currentUser;
      if (!targetUser) {
        throw new Error('No user available for email verification');
      }

      const defaultSettings = {
        url: `${window.location.origin}?emailVerified=true`,
        handleCodeInApp: false
      };

      await sendEmailVerification(targetUser, actionCodeSettings || defaultSettings);
      console.log('✅ Email verification sent');
      return { success: true };
    } catch (error) {
      console.error('❌ Email verification error:', error);
      return { success: false, error: error };
    }
  }

  async sendPasswordReset(email) {
    try {
      await sendPasswordResetEmail(this.auth, email);
      console.log('✅ Password reset email sent');
      return { success: true };
    } catch (error) {
      console.error('❌ Password reset error:', error);
      return { success: false, error: error };
    }
  }

  async refreshUserEmailStatus() {
    if (!this.auth.currentUser) {
      return { success: false, error: 'No current user' };
    }
    
    try {
      await this.auth.currentUser.reload();
      
      const isNowVerified = this.auth.currentUser.emailVerified;
      
      if (isNowVerified) {
        // Otorgar bonus por verificación si no se ha dado antes
        const userData = await this.getUserData(this.auth.currentUser.uid);
        if (userData.success && userData.data && !userData.data.emailVerified) {
          await this.processEmailVerification(this.auth.currentUser.uid);
        }
      }
      
      console.log('🔄 User email status refreshed');
      return { success: true, emailVerified: isNowVerified };
    } catch (error) {
      console.error('❌ Error refreshing email status:', error);
      return { success: false, error: error };
    }
  }

  // ========== FIRESTORE METHODS ==========
  
  async saveUserData(uid, userData) {
    try {
      await setDoc(doc(this.db, 'users', uid), userData);
      console.log('✅ User data saved to Firestore');
      return { success: true };
    } catch (error) {
      console.error('❌ Error saving user data:', error);
      return { success: false, error: error };
    }
  }

  async updateUserData(uid, updates) {
    try {
      await setDoc(doc(this.db, 'users', uid), updates, { merge: true });
      console.log('✅ User data updated in Firestore');
      return { success: true };
    } catch (error) {
      console.error('❌ Error updating user data:', error);
      return { success: false, error: error };
    }
  }

  async getUserData(uid) {
    try {
      const userDoc = await getDoc(doc(this.db, 'users', uid));
      
      if (userDoc.exists()) {
        console.log('✅ User data retrieved from Firestore');
        return { success: true, data: userDoc.data() };
      } else {
        console.log('⚠️ No user document found');
        return { success: false, error: 'No user document found' };
      }
    } catch (error) {
      console.error('❌ Error getting user data:', error);
      return { success: false, error: error };
    }
  }

  // ========== AUTH STATE LISTENER ==========
  
  onAuthStateChanged(callback) {
    return onAuthStateChanged(this.auth, (user) => {
      if (user) {
        // Cargar recompensas cuando el usuario se autentica
        this.loadUserRewards(user.uid);
      } else {
        // Limpiar datos de recompensas cuando no hay usuario
        sessionStorage.removeItem('userRewards');
      }
      callback(user);
    });
  }

  // ========== UTILITY METHODS ==========
  
  getCurrentUser() {
    return this.auth.currentUser;
  }

  isUserSignedIn() {
    return !!this.auth.currentUser;
  }

  isEmailVerified() {
    return this.auth.currentUser?.emailVerified || false;
  }

  getCurrentUserRewards() {
    const rewards = sessionStorage.getItem('userRewards');
    return rewards ? JSON.parse(rewards) : null;
  }

  // ========== ERROR HANDLING ==========
  
  getErrorMessage(error) {
    const errorMessages = {
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

    return errorMessages[error.code] || error.message || 'Error desconocido';
  }
}

// Create and export Firebase service instance
const firebaseService = new FirebaseService();

// Export modules
export {
  firebaseService as default,
  auth,
  db,
  REWARDS_CONFIG
};

// Make Firebase service globally available
window.firebaseService = firebaseService;

// Simple API for pedido.html
window.FratelliFirebaseAPI = {
  async addPointsAfterPurchase(orderTotal, orderId = null) {
    if (firebaseService.getCurrentUser()) {
      const points = firebaseService.calculateOrderPoints(orderTotal);
      const result = await firebaseService.addPoints(
        firebaseService.getCurrentUser().uid,
        points,
        `Compra - Pedido ${orderId || 'nuevo'}`,
        orderId
      );
      
      if (result.success) {
        console.log(`🎁 ${points} puntos otorgados por compra de ${orderTotal}€`);
        return { success: true, points: points };
      }
    }
    return { success: false, points: 0 };
  },

  getCurrentPoints() {
    const rewards = firebaseService.getCurrentUserRewards();
    return rewards ? rewards.points : 0;
  },

  isUserSignedIn() {
    return firebaseService.isUserSignedIn();
  },

  getCurrentUser() {
    return firebaseService.getCurrentUser();
  }
};

console.log(`
🔥 FIREBASE SERVICE WITH ENHANCED REWARDS
=========================================

✅ Firebase Auth: Ready
✅ Firestore: Ready  
✅ Enhanced Rewards: Ready
✅ Service Class: Available as window.firebaseService

🎁 REWARDS FEATURES:
• ${REWARDS_CONFIG.pointsPerEuro} points per € spent
• ${REWARDS_CONFIG.welcomeBonus} welcome bonus points
• ${REWARDS_CONFIG.emailVerificationBonus} email verification bonus
• ${REWARDS_CONFIG.levelUpBonus} level up bonus
• Complete level system with 4 tiers
• Secure reward redemption system

🚀 Available Methods:
• firebaseService.addPoints(uid, points, reason)
• firebaseService.spendPoints(uid, points, reason, rewardData)
• firebaseService.loadUserRewards(uid)
• firebaseService.processOrderWithRewards(uid, orderData)
• firebaseService.checkLevelUp(uid)

💻 Simple API for pedido.html:
• window.FratelliFirebaseAPI.addPointsAfterPurchase(total, orderId)
• window.FratelliFirebaseAPI.getCurrentPoints()
• window.FratelliFirebaseAPI.isUserSignedIn()

📱 Ready for Fratelli Pazzi with Enhanced Rewards!
`);
