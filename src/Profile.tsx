import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Button,
  Card,
  CardContent,
  Divider,
  Chip,
  TextField,
  Switch,
  FormControlLabel,
  IconButton
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  CalendarToday as CalendarIcon,
  Settings as SettingsIcon,
  Palette as PaletteIcon,
  Notifications as NotificationsIcon,
  Security as SecurityIcon
} from '@mui/icons-material';

type GoogleJwtPayload = {
  email?: string;
  name?: string;
  picture?: string;
  sub?: string;
  exp?: number;
};

const Profile: React.FC = () => {
  const [user, setUser] = useState<GoogleJwtPayload | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [preferredColor, setPreferredColor] = useState('#5a6c7d');

  const colorPalette = [
    '#5a6c7d', '#6b7d8f', '#8fa3b3', '#b3c5d1', // Blues
    '#e53e3e', '#f56565', '#fc8181', '#fed7d7', // Reds
    '#38a169', '#48bb78', '#68d391', '#9ae6b4', // Greens
    '#d69e2e', '#ed8936', '#f6ad55', '#fbd38d', // Yellows/Oranges
    '#805ad5', '#9f7aea', '#b794f4', '#d6bcfa', // Purples
    '#319795', '#38b2ac', '#4fd1c7', '#81e6d9'  // Teals
  ];

  useEffect(() => {
    const stored = localStorage.getItem('tide_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GoogleJwtPayload;
        setUser(parsed);
        setDisplayName(parsed.name || '');
      } catch (_) {
        // Handle error
      }
    }
  }, []);

  const handleSave = () => {
    if (user) {
      const updatedUser = { ...user, name: displayName };
      localStorage.setItem('tide_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDisplayName(user?.name || '');
    setIsEditing(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!user) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh">
        <Typography variant="h6" sx={{ color: '#4a5568' }}>
          Loading profile...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      backgroundColor: '#FAFBFC',
      p: 3
    }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ 
            color: '#4a5568', 
            fontFamily: 'Quicksand, sans-serif',
            fontWeight: 300,
            mb: 1
          }}>
            Profile
          </Typography>
          <Typography variant="body1" sx={{ color: '#8fa3b3' }}>
            Manage your account settings and preferences
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Profile Card */}
          <Box sx={{ flex: { xs: '1', md: '0 0 300px' } }}>
            <Card sx={{ 
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <Avatar
                  src={user.picture}
                  sx={{ 
                    width: 120, 
                    height: 120, 
                    mx: 'auto', 
                    mb: 2,
                    border: '4px solid #f1f5f8'
                  }}
                />
                <Typography variant="h5" sx={{ 
                  color: '#4a5568', 
                  fontWeight: 500,
                  mb: 1
                }}>
                  {user.name}
                </Typography>
                <Typography variant="body2" sx={{ 
                  color: '#8fa3b3',
                  mb: 2
                }}>
                  {user.email}
                </Typography>
                <Chip 
                  label="Google Account" 
                  sx={{ 
                    backgroundColor: '#f1f5f8',
                    color: '#4a5568',
                    border: '1px solid #e2e8f0'
                  }}
                />
              </CardContent>
            </Card>
          </Box>

          {/* Settings */}
          <Box sx={{ flex: 1 }}>
            <Card sx={{ 
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <PersonIcon sx={{ color: '#5a6c7d', mr: 1 }} />
                  <Typography variant="h6" sx={{ color: '#4a5568' }}>
                    Personal Information
                  </Typography>
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ color: '#4a5568', flexGrow: 1 }}>
                      Display Name
                    </Typography>
                    {!isEditing && (
                      <IconButton 
                        onClick={() => setIsEditing(true)}
                        sx={{ color: '#5a6c7d' }}
                      >
                        <EditIcon />
                      </IconButton>
                    )}
                  </Box>
                  
                  {isEditing ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        variant="outlined"
                        size="small"
                        sx={{ flexGrow: 1 }}
                      />
                      <IconButton onClick={handleSave} sx={{ color: '#38a169' }}>
                        <SaveIcon />
                      </IconButton>
                      <IconButton onClick={handleCancel} sx={{ color: '#e53e3e' }}>
                        <CancelIcon />
                      </IconButton>
                    </Box>
                  ) : (
                    <Typography variant="body1" sx={{ color: '#4a5568' }}>
                      {user.name}
                    </Typography>
                  )}
                </Box>

                <Divider sx={{ my: 3 }} />

                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <EmailIcon sx={{ color: '#5a6c7d', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: '#4a5568' }}>
                      Email Address
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ color: '#4a5568' }}>
                    {user.email}
                  </Typography>
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CalendarIcon sx={{ color: '#5a6c7d', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: '#4a5568' }}>
                      Account Created
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ color: '#4a5568' }}>
                    {user.exp ? formatDate(user.exp) : 'Unknown'}
                  </Typography>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Preferences */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SettingsIcon sx={{ color: '#5a6c7d', mr: 1 }} />
                    <Typography variant="h6" sx={{ color: '#4a5568' }}>
                      Preferences
                    </Typography>
                  </Box>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={notifications}
                        onChange={(e) => setNotifications(e.target.checked)}
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': {
                            color: '#5a6c7d',
                          },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: '#5a6c7d',
                          },
                        }}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <NotificationsIcon sx={{ color: '#8fa3b3', mr: 1, fontSize: 20 }} />
                        <Typography variant="body1" sx={{ color: '#4a5568' }}>
                          Email Notifications
                        </Typography>
                      </Box>
                    }
                    sx={{ mb: 2 }}
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={darkMode}
                        onChange={(e) => setDarkMode(e.target.checked)}
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': {
                            color: '#5a6c7d',
                          },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: '#5a6c7d',
                          },
                        }}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <PaletteIcon sx={{ color: '#8fa3b3', mr: 1, fontSize: 20 }} />
                        <Typography variant="body1" sx={{ color: '#4a5568' }}>
                          Dark Mode
                        </Typography>
                      </Box>
                    }
                    sx={{ mb: 2 }}
                  />
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Theme Color */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PaletteIcon sx={{ color: '#5a6c7d', mr: 1 }} />
                    <Typography variant="subtitle1" sx={{ color: '#4a5568' }}>
                      Theme Color
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {colorPalette.map((color) => (
                      <Box
                        key={color}
                        onClick={() => setPreferredColor(color)}
                        sx={{
                          width: 32,
                          height: 32,
                          backgroundColor: color,
                          borderRadius: '50%',
                          cursor: 'pointer',
                          border: preferredColor === color ? '3px solid #4a5568' : '2px solid #e2e8f0',
                          transition: 'all 0.2s',
                          '&:hover': {
                            transform: 'scale(1.1)',
                            borderColor: '#4a5568'
                          }
                        }}
                      />
                    ))}
                  </Box>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Account Actions */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SecurityIcon sx={{ color: '#5a6c7d', mr: 1 }} />
                    <Typography variant="h6" sx={{ color: '#4a5568' }}>
                      Account Actions
                    </Typography>
                  </Box>
                  
                  <Button
                    variant="outlined"
                    sx={{
                      borderColor: '#e53e3e',
                      color: '#e53e3e',
                      '&:hover': {
                        borderColor: '#c53030',
                        backgroundColor: '#fed7d7'
                      }
                    }}
                    onClick={() => {
                      localStorage.removeItem('tide_user');
                      window.location.reload();
                    }}
                  >
                    Sign Out
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Profile;
