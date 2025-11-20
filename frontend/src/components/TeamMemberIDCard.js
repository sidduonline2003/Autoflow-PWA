import React, { useMemo, useRef } from 'react';
import { 
  Card, CardContent, CardActions, Avatar, Typography, Box, Chip, 
  Button, Divider, Tooltip, IconButton, useTheme 
} from '@mui/material';
import { 
  Download as DownloadIcon, 
  ContentCopy as ContentCopyIcon,
  Verified as VerifiedIcon,
  Fingerprint as FingerprintIcon,
  Work as WorkIcon,
  Email as EmailIcon,
  Phone as PhoneIcon
} from '@mui/icons-material';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';
import toast from 'react-hot-toast';

/*
  Premium Team Member ID Card
  - Glassmorphism design
  - Holographic visual effects
  - High-contrast readability
*/
const TeamMemberIDCard = ({ member = {}, orgName = 'Autoflow Studio', orgId = '', showActions = true }) => {
  const cardRef = useRef(null);
  const theme = useTheme();

  // Safe extract of props
  const name = member?.name || 'Team Member';
  const role = member?.role || 'Crew';
  const email = member?.email || 'No Email';
  const phone = member?.phone || 'No Phone';
  const photo = member?.profilePhoto || '';
  const skills = member?.skills || [];
  const employeeCode = member?.employeeCode || member?.userId?.substring(0, 8).toUpperCase() || 'N/A';
  
  const qrValue = useMemo(() => {
    return JSON.stringify({ 
      t: 'team-id', 
      uid: member?.userId, 
      code: employeeCode, 
      org: orgId, 
      n: name, 
      r: role 
    });
  }, [member, orgId, employeeCode, name, role]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { 
        cacheBust: true, 
        pixelRatio: 3, // High res for printing
        backgroundColor: 'transparent' // Allow transparency in corners
      });
      const link = document.createElement('a');
      link.download = `${name.replace(/\s+/g, '_')}_ID_Card.png`;
      link.href = dataUrl;
      link.click();
      toast.success('ID Card downloaded');
    } catch (e) {
      console.error('Failed to download ID card', e);
      toast.error('Could not download ID card');
    }
  };

  const handleCopyCode = () => {
    if (employeeCode && employeeCode !== 'N/A') {
      navigator.clipboard.writeText(employeeCode);
      toast.success('Employee ID copied');
    }
  };

  return (
    <Box sx={{ perspective: '1000px', width: '100%', maxWidth: 400, margin: '0 auto' }}>
      {/* Main Card Container */}
      <Card
        ref={cardRef}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 4,
          background: 'linear-gradient(145deg, #1a202c 0%, #2d3748 100%)',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#e2e8f0',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
          '&:hover': {
            transform: 'translateY(-5px) rotateX(2deg)',
            boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6), 0 0 0 2px rgba(66, 153, 225, 0.3)'
          }
        }}
      >
        {/* Background Abstract Shapes */}
        <Box sx={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(66,153,225,0.2) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0
        }} />
        <Box sx={{
          position: 'absolute',
          bottom: -50,
          left: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(72,187,120,0.15) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0
        }} />

        {/* Decorative Top Bar */}
        <Box sx={{ 
          height: 6, 
          background: 'linear-gradient(90deg, #4299e1 0%, #48bb78 50%, #ed8936 100%)',
          width: '100%'
        }} />

        <CardContent sx={{ position: 'relative', zIndex: 1, p: 3 }}>
          
          {/* Header: Organization & Validation */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Box>
               <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, fontWeight: 700, lineHeight: 1 }}>
                 OFFICIAL MEMBER
               </Typography>
               <Typography variant="h6" sx={{ fontWeight: 800, background: 'linear-gradient(90deg, #fff, #a0aec0)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>
                 {orgName}
               </Typography>
            </Box>
            <Tooltip title="Verified Employee">
              <VerifiedIcon sx={{ color: '#48bb78', fontSize: 28, filter: 'drop-shadow(0 0 8px rgba(72,187,120,0.4))' }} />
            </Tooltip>
          </Box>

          {/* Profile Section */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Box sx={{ position: 'relative', mr: 2.5 }}>
              <Avatar
                src={photo}
                alt={name}
                sx={{ 
                  width: 90, 
                  height: 90, 
                  border: '3px solid #2d3748',
                  boxShadow: '0 0 0 3px rgba(66,153,225,0.6)'
                }}
              />
              <Box sx={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                width: 16,
                height: 16,
                bgcolor: '#48bb78',
                borderRadius: '50%',
                border: '2px solid #1a202c'
              }} />
            </Box>
            
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h5" noWrap sx={{ fontWeight: 800, color: '#fff', mb: 0.5 }}>
                {name}
              </Typography>
              <Chip 
                icon={<WorkIcon sx={{ fontSize: 14 }} />} 
                label={role} 
                size="small" 
                sx={{ 
                  bgcolor: 'rgba(66,153,225,0.2)', 
                  color: '#63b3ed', 
                  border: '1px solid rgba(66,153,225,0.3)',
                  fontWeight: 600,
                  borderRadius: 2
                }} 
              />
            </Box>
          </Box>

          {/* Info Grid */}
          <Box sx={{ 
            bgcolor: 'rgba(0,0,0,0.2)', 
            borderRadius: 3, 
            p: 2, 
            backdropFilter: 'blur(5px)',
            border: '1px solid rgba(255,255,255,0.05)',
            mb: 3
          }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#718096', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <FingerprintIcon sx={{ fontSize: 14 }} /> ID CODE
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', letterSpacing: 1 }}>
                  {employeeCode}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="caption" sx={{ color: '#718096', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <EmailIcon sx={{ fontSize: 14 }} /> EMAIL
                </Typography>
                <Typography variant="body2" noWrap sx={{ fontWeight: 500, color: '#e2e8f0' }} title={email}>
                  {email.split('@')[0]}
                </Typography>
              </Box>

              <Box sx={{ gridColumn: 'span 2' }}>
                <Typography variant="caption" sx={{ color: '#718096', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <PhoneIcon sx={{ fontSize: 14 }} /> CONTACT
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, color: '#e2e8f0' }}>
                  {phone}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Footer: Skills & QR */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Box sx={{ flex: 1, mr: 2 }}>
              {skills.length > 0 && (
                 <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                  {skills.slice(0, 3).map((skill, i) => (
                    <Chip 
                      key={i} 
                      label={skill} 
                      size="small" 
                      sx={{ 
                        height: 22, 
                        fontSize: '0.65rem', 
                        bgcolor: 'rgba(255,255,255,0.1)', 
                        color: '#cbd5e0' 
                      }} 
                    />
                  ))}
                  {skills.length > 3 && (
                    <Chip label={`+${skills.length - 3}`} size="small" sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'transparent', color: '#718096', border: '1px solid rgba(255,255,255,0.1)' }} />
                  )}
                 </Box>
              )}
              {!skills.length && (
                <Typography variant="caption" sx={{ color: '#718096', fontStyle: 'italic' }}>
                  Official Identity Card
                </Typography>
              )}
            </Box>

            <Box sx={{ 
              p: 0.5, 
              bgcolor: '#fff', 
              borderRadius: 1.5,
              height: 64,
              width: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <QRCode value={qrValue} size={56} />
            </Box>
          </Box>
        </CardContent>

        {/* Action Footer (Only visible in UI, usually removed in print/download via CSS logic or simply kept) */}
        {showActions && (
          <Box sx={{ 
            px: 3, 
            pb: 3, 
            pt: 0, 
            display: 'flex', 
            gap: 2, 
            position: 'relative',
            zIndex: 2
          }}>
            <Button 
              variant="contained" 
              fullWidth
              onClick={handleDownload}
              startIcon={<DownloadIcon />}
              sx={{ 
                bgcolor: '#4299e1', 
                '&:hover': { bgcolor: '#3182ce' },
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                boxShadow: '0 4px 14px 0 rgba(66,153,225,0.39)'
              }}
            >
              Download PNG
            </Button>
            <Tooltip title="Copy Employee Code">
              <IconButton 
                onClick={handleCopyCode}
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.05)', 
                  color: '#a0aec0',
                  borderRadius: 2,
                  border: '1px solid rgba(255,255,255,0.1)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' }
                }}
              >
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Card>
    </Box>
  );
};

export default TeamMemberIDCard;