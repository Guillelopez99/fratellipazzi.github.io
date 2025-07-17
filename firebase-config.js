// ========== FIREBASE CONFIGURATION & AUTHENTICATION ==========
// Firebase configuration and authentication module for Fratelli Pazzi

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, sendEmailVerification,
         sendPasswordResetEmail, signOut, updateProfile } 
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } 
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

// Firebase Service Class
class FirebaseService {
  constructor() {
    this.auth = auth;
    this.db = db;
    this.isInitialized = true;
    
    console.log('🔥 Firebase Service initialized');
  }

  // ========== AUTHENTICATION METHODS ==========
  
  async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      console.log('✅ User signed in:', userCredential.user.email);
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

      // Save user data to Firestore
      await this.saveUserData(userCredential.user.uid, {
        name: userData.name,
        email: email,
        phone: userData.phone || null,
        acceptsOffers: userData.acceptsOffers || false,
        registeredAt: new Date().toISOString(),
        points: 0,
        orders: [],
        hasUsedWelcomeDiscount: false,
        emailVerified: false
      });

      console.log('✅ User registered:', userCredential.user.email);
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      return { success: false, error: error };
    }
  }

  async signOut() {
    try {
      await signOut(this.auth);
      console.log('✅ User signed out');
      return { success: true };
    } catch (error) {
      console.error('❌ Sign out error:', error);
      return { success: false, error: error };
    }
  }

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
        // Update Firestore with verification status
        try {
          await this.updateUserData(this.auth.currentUser.uid, {
            emailVerified: true,
            emailVerifiedAt: new Date().toISOString()
          });
        } catch (firestoreError) {
          console.error('⚠️ Error updating Firestore:', firestoreError);
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
    return onAuthStateChanged(this.auth, callback);
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

    return errorMessages[error.code] || 'Error desconocido';
  }
}

// Create and export Firebase service instance
const firebaseService = new FirebaseService();

// Also export individual Firebase modules for backward compatibility
export {
  firebaseService as default,
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc
};

// Make Firebase service globally available
window.firebaseService = firebaseService;

// Legacy compatibility - maintain old window.firebase structure
window.firebase = {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc
};

console.log(`
🔥 FIREBASE SERVICE INITIALIZED
===============================

✅ Firebase Auth: Ready
✅ Firestore: Ready
✅ Service Class: Available as window.firebaseService
✅ Legacy Support: window.firebase maintained

🚀 Available Methods:
• firebaseService.signIn(email, password)
• firebaseService.signUp(email, password, userData)
• firebaseService.signOut()
• firebaseService.sendEmailVerification()
• firebaseService.sendPasswordReset(email)
• firebaseService.getUserData(uid)
• firebaseService.updateUserData(uid, updates)
• firebaseService.onAuthStateChanged(callback)

📱 Ready for Fratelli Pazzi authentication!
`);
