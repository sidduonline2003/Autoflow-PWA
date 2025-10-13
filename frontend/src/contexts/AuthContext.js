import React, { createContext, useContext, useState, useEffect } from 'react';
import { onIdTokenChanged } from 'firebase/auth'; // Using onIdTokenChanged
import { auth } from '../firebase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [claims, setClaims] = useState(null);
    const [loading, setLoading] = useState(true);

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

    const value = { user, claims, loading };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext);
}
