import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onIdTokenChanged } from 'firebase/auth'; // Using onIdTokenChanged
import { auth } from '../firebase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [claims, setClaims] = useState(null);
    const [loading, setLoading] = useState(true);

    // Function to force refresh the token and update claims
    const refreshToken = useCallback(async () => {
        if (auth.currentUser) {
            try {
                // Force refresh the token
                await auth.currentUser.getIdToken(true);
                // Get fresh claims
                const idTokenResult = await auth.currentUser.getIdTokenResult();
                setClaims(idTokenResult.claims);
                console.log('Token refreshed, new claims:', idTokenResult.claims);
                return idTokenResult.claims;
            } catch (error) {
                console.error('Error refreshing token:', error);
                throw error;
            }
        }
        return null;
    }, []);

    useEffect(() => {
        let mounted = true;
        
        // Add timeout to prevent infinite loading if Firebase is slow
        const timeoutId = setTimeout(() => {
            if (mounted) {
                console.warn('Firebase auth initialization timeout - proceeding anyway');
                setLoading(false);
            }
        }, 5000); // 5 second timeout

        // This listener fires on login/logout AND when the token (and its claims) changes.
        const unsubscribe = onIdTokenChanged(auth, async (user) => {
            if (!mounted) return;
            
            try {
                if (user) {
                    const idTokenResult = await user.getIdTokenResult();
                    setUser(user);
                    setClaims(idTokenResult.claims);
                    
                    // Log claims for debugging
                    console.log('Auth state changed, claims:', {
                        orgId: idTokenResult.claims.orgId,
                        role: idTokenResult.claims.role
                    });
                } else {
                    setUser(null);
                    setClaims(null);
                }
            } catch (error) {
                console.error('Error fetching auth token:', error);
                setUser(null);
                setClaims(null);
            } finally {
                setLoading(false);
                clearTimeout(timeoutId);
            }
        });

        return () => {
            mounted = false;
            unsubscribe();
            clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value = { user, claims, loading, refreshToken };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext);
}
