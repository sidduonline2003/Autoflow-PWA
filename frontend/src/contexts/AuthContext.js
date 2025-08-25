import React, { createContext, useContext, useState, useEffect } from 'react';
import { onIdTokenChanged } from 'firebase/auth'; // Using onIdTokenChanged
import { auth } from '../firebase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [claims, setClaims] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // This listener fires on login/logout AND when the token (and its claims) changes.
        const unsubscribe = onIdTokenChanged(auth, async (user) => {
            if (user) {
                const idTokenResult = await user.getIdTokenResult();
                setUser(user);
                setClaims(idTokenResult.claims);
            } else {
                setUser(null);
                setClaims(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
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
