import React, { useEffect, useState } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

type Props = {
  children: React.ReactNode;
};

type GoogleJwtPayload = {
  email?: string;
  name?: string;
  picture?: string;
  sub?: string; // Google user ID
  exp?: number;
};

const AuthGate: React.FC<Props> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GoogleJwtPayload | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('tide_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GoogleJwtPayload;
        if (!parsed.exp || parsed.exp * 1000 > Date.now()) {
          setUser(parsed);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('tide_user');
        }
      } catch (_) {
        localStorage.removeItem('tide_user');
      }
    }
    setIsLoading(false);
  }, []);

  const handleSuccess = (cred: CredentialResponse) => {
    try {
      if (!cred.credential) return;
      const decoded = jwtDecode<GoogleJwtPayload>(cred.credential);
      setUser(decoded);
      setIsAuthenticated(true);
      localStorage.setItem('tide_user', JSON.stringify(decoded));
    } catch (e) {
      // no-op
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tide_user');
    setUser(null);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh" flexDirection="column" gap={2}>
        <Typography variant="h5">Sign in to continue</Typography>
        <GoogleLogin onSuccess={handleSuccess} onError={() => {}} useOneTap />
      </Box>
    );
  }

  return (
    <Box>
      {children}
    </Box>
  );
};

export default AuthGate;


