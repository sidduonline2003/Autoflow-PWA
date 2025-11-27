import React, { useMemo, useRef, useState } from 'react';
import { 
  Box, Typography, Chip, Button, Tooltip, IconButton, Avatar
} from '@mui/material';
import { 
  Download as DownloadIcon, 
  ContentCopy as ContentCopyIcon,
  Verified as VerifiedIcon,
  Fingerprint as FingerprintIcon,
  FlipCameraAndroid as FlipIcon,
  Share as ShareIcon,
  CalendarMonth as CalendarIcon,
  LocalHospital as MedicalIcon,
  ContactPhone as ContactPhoneIcon
} from '@mui/icons-material';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';
import toast from 'react-hot-toast';

/*
  Ultra-Premium Team Member ID Card
  - 3D Flip Card with Front/Back faces
  - Cyber-Glass Aesthetic with Mesh Gradients
  - Role-based color theming
  - Holographic shimmer effects
  - Noise texture overlay
  - Pulsing live status indicator
*/

// Role-based gradient configurations
const roleGradients = {
  admin: {
    colors: ['#f59e0b', '#d97706', '#b45309', '#92400e'],
    accent: '#fbbf24',
    border: 'rgba(251, 191, 36, 0.6)',
    glow: '0 0 30px rgba(251, 191, 36, 0.3)',
    label: 'ADMINISTRATOR'
  },
  editor: {
    colors: ['#06b6d4', '#0891b2', '#0e7490', '#155e75'],
    accent: '#22d3ee',
    border: 'rgba(34, 211, 238, 0.6)',
    glow: '0 0 30px rgba(34, 211, 238, 0.3)',
    label: 'EDITOR'
  },
  post_supervisor: {
    colors: ['#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6'],
    accent: '#a78bfa',
    border: 'rgba(167, 139, 250, 0.6)',
    glow: '0 0 30px rgba(167, 139, 250, 0.3)',
    label: 'POST SUPERVISOR'
  },
  'data-manager': {
    colors: ['#10b981', '#059669', '#047857', '#065f46'],
    accent: '#34d399',
    border: 'rgba(52, 211, 153, 0.6)',
    glow: '0 0 30px rgba(52, 211, 153, 0.3)',
    label: 'DATA MANAGER'
  },
  crew: {
    colors: ['#f97316', '#ea580c', '#c2410c', '#9a3412'],
    accent: '#fb923c',
    border: 'rgba(251, 146, 60, 0.6)',
    glow: '0 0 30px rgba(251, 146, 60, 0.3)',
    label: 'CREW MEMBER'
  },
  default: {
    colors: ['#64748b', '#475569', '#334155', '#1e293b'],
    accent: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.6)',
    glow: '0 0 30px rgba(148, 163, 184, 0.3)',
    label: 'TEAM MEMBER'
  }
};

const TeamMemberIDCard = ({ 
  member = {}, 
  orgName = 'Autoflow Studio', 
  orgId = '', 
  showActions = true 
}) => {
  const cardRef = useRef(null);
  const frontRef = useRef(null);
  const [isFlipped, setIsFlipped] = useState(false);

  // Safe extract of props
  const name = member?.name || 'Team Member';
  const role = member?.role?.toLowerCase() || 'crew';
  const email = member?.email || 'No Email';
  const phone = member?.phone || 'No Phone';
  const photo = member?.profilePhoto || '';
  const employeeCode = member?.employeeCode || member?.userId?.substring(0, 8).toUpperCase() || 'N/A';
  const isAvailable = member?.availability ?? false;
  const joinDate = member?.joinDate || member?.createdAt || new Date().toISOString();
  const emergencyContact = member?.emergencyContact || 'Not Provided';
  const department = member?.department || 'General';
  
  // Get role-specific styling
  const roleStyle = roleGradients[role] || roleGradients.default;
  const currentYear = new Date().getFullYear();
  const formattedJoinDate = new Date(joinDate).toLocaleDateString('en-US', { 
    month: 'short', 
    year: 'numeric' 
  });

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
    if (!frontRef.current) return;
    try {
      // Temporarily flip to front if on back
      const wasFlipped = isFlipped;
      if (wasFlipped) setIsFlipped(false);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const dataUrl = await toPng(frontRef.current, { 
        cacheBust: true, 
        pixelRatio: 3,
        backgroundColor: '#0f172a'
      });
      const link = document.createElement('a');
      link.download = `${name.replace(/\s+/g, '_')}_ID_Card.png`;
      link.href = dataUrl;
      link.click();
      toast.success('ID Card downloaded');
      
      if (wasFlipped) setIsFlipped(true);
    } catch (e) {
      console.error('Failed to download ID card', e);
      toast.error('Could not download ID card');
    }
  };

  const handleShare = async () => {
    if (!frontRef.current) return;
    try {
      const dataUrl = await toPng(frontRef.current, { cacheBust: true, pixelRatio: 2 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${name}_ID.png`, { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${name}'s ID Card`,
          text: `Official ID Card for ${name} at ${orgName}`,
          files: [file]
        });
        toast.success('Shared successfully');
      } else {
        handleDownload();
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        toast.error('Could not share');
      }
    }
  };

  const handleCopyCode = () => {
    if (employeeCode && employeeCode !== 'N/A') {
      navigator.clipboard.writeText(employeeCode);
      toast.success('Employee ID copied');
    }
  };

  // SVG Noise Pattern
  const noisePattern = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

  // Guilloché pattern for security
  const guillocheSvg = `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 50 Q25 0 50 50 T100 50' fill='none' stroke='rgba(255,255,255,0.03)' stroke-width='0.5'/%3E%3Cpath d='M0 60 Q25 10 50 60 T100 60' fill='none' stroke='rgba(255,255,255,0.02)' stroke-width='0.5'/%3E%3Cpath d='M0 40 Q25 -10 50 40 T100 40' fill='none' stroke='rgba(255,255,255,0.02)' stroke-width='0.5'/%3E%3C/svg%3E")`;

  return (
    <Box sx={{ width: '100%', maxWidth: 340, margin: '0 auto' }}>
      {/* 3D Flip Container */}
      <Box
        ref={cardRef}
        sx={{
          perspective: '1500px',
          height: 520,
          cursor: 'pointer'
        }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
          }}
        >
          {/* ==================== FRONT FACE ==================== */}
          <Box
            ref={frontRef}
            sx={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              borderRadius: 4,
              overflow: 'hidden',
              background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
              boxShadow: `0 25px 50px -12px rgba(0,0,0,0.7), ${roleStyle.glow}`,
              border: `2px solid ${roleStyle.border}`,
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: noisePattern,
                opacity: 0.04,
                mixBlendMode: 'overlay',
                pointerEvents: 'none',
                zIndex: 1
              },
              '&::after': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: '-150%',
                width: '50%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
                transform: 'skewX(-25deg)',
                transition: 'left 0.8s ease',
                zIndex: 10,
                pointerEvents: 'none'
              },
              '&:hover::after': {
                left: '150%'
              }
            }}
          >
            {/* Mesh Gradient Blobs */}
            <Box sx={{
              position: 'absolute',
              top: -80,
              right: -80,
              width: 250,
              height: 250,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${roleStyle.colors[0]}40 0%, transparent 70%)`,
              filter: 'blur(40px)',
              zIndex: 0
            }} />
            <Box sx={{
              position: 'absolute',
              bottom: 100,
              left: -60,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${roleStyle.colors[1]}30 0%, transparent 70%)`,
              filter: 'blur(50px)',
              zIndex: 0
            }} />
            <Box sx={{
              position: 'absolute',
              bottom: -50,
              right: 20,
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${roleStyle.colors[2]}25 0%, transparent 70%)`,
              filter: 'blur(30px)',
              zIndex: 0
            }} />

            {/* Guilloché Security Pattern */}
            <Box sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: guillocheSvg,
              backgroundSize: '100px 100px',
              opacity: 0.5,
              zIndex: 1
            }} />

            {/* Card Content */}
            <Box sx={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', p: 2.5 }}>
              
              {/* Header: Org & Year */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box>
                  <Typography 
                    sx={{ 
                      fontFamily: '"Inter", sans-serif',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: 'rgba(255,255,255,0.4)',
                      textTransform: 'uppercase'
                    }}
                  >
                    Official Access Pass
                  </Typography>
                  <Typography 
                    sx={{ 
                      fontFamily: '"Inter", sans-serif',
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      background: `linear-gradient(135deg, #fff 0%, ${roleStyle.accent} 100%)`,
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      color: 'transparent',
                      letterSpacing: '-0.02em'
                    }}
                  >
                    {orgName}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography 
                    sx={{ 
                      fontFamily: '"Space Mono", "Roboto Mono", monospace',
                      fontSize: '0.6rem',
                      color: 'rgba(255,255,255,0.3)',
                      letterSpacing: '0.1em'
                    }}
                  >
                    ISSUED
                  </Typography>
                  <Typography 
                    sx={{ 
                      fontFamily: '"Space Mono", "Roboto Mono", monospace',
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.6)',
                      fontWeight: 600
                    }}
                  >
                    {currentYear}
                  </Typography>
                </Box>
              </Box>

              {/* Large Photo Section */}
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <Box sx={{ position: 'relative' }}>
                  <Avatar
                    src={photo}
                    alt={name}
                    sx={{ 
                      width: 140, 
                      height: 140, 
                      borderRadius: 3,
                      border: `3px solid ${roleStyle.border}`,
                      boxShadow: `0 10px 30px -5px rgba(0,0,0,0.5), ${roleStyle.glow}`
                    }}
                  >
                    {name.charAt(0)}
                  </Avatar>
                  
                  {/* Live Status Indicator */}
                  {isAvailable && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: 'rgba(0,0,0,0.7)',
                        borderRadius: 2,
                        px: 1,
                        py: 0.3,
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: '#22c55e',
                          animation: 'pulse 2s infinite',
                          boxShadow: '0 0 10px #22c55e',
                          '@keyframes pulse': {
                            '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.7)' },
                            '70%': { boxShadow: '0 0 0 8px rgba(34, 197, 94, 0)' },
                            '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' }
                          }
                        }}
                      />
                      <Typography sx={{ fontSize: '0.55rem', color: '#22c55e', fontWeight: 700, letterSpacing: '0.05em' }}>
                        ACTIVE
                      </Typography>
                    </Box>
                  )}

                  {/* Verified Badge */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      bgcolor: roleStyle.accent,
                      borderRadius: '50%',
                      p: 0.5,
                      display: 'flex',
                      boxShadow: `0 0 15px ${roleStyle.accent}80`
                    }}
                  >
                    <VerifiedIcon sx={{ fontSize: 18, color: '#0f172a' }} />
                  </Box>
                </Box>
              </Box>

              {/* Name & Role */}
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Typography 
                  sx={{ 
                    fontFamily: '"Inter", sans-serif',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.2em',
                    color: roleStyle.accent,
                    textTransform: 'uppercase',
                    mb: 0.5
                  }}
                >
                  {roleStyle.label}
                </Typography>
                <Typography 
                  sx={{ 
                    fontFamily: '"Inter", sans-serif',
                    fontSize: '1.5rem',
                    fontWeight: 900,
                    color: '#fff',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                    textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                  }}
                >
                  {name}
                </Typography>
              </Box>

              {/* Spacer */}
              <Box sx={{ flex: 1 }} />

              {/* Data Strip */}
              <Box 
                sx={{ 
                  bgcolor: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 2,
                  p: 1.5,
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <FingerprintIcon sx={{ fontSize: 10 }} /> EMPLOYEE ID
                    </Typography>
                    <Typography 
                      sx={{ 
                        fontFamily: '"OCR A Std", "Space Mono", monospace',
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: '#fff',
                        letterSpacing: '0.15em'
                      }}
                    >
                      {employeeCode}
                    </Typography>
                  </Box>
                  <Tooltip title="Tap to flip">
                    <FlipIcon sx={{ fontSize: 20, color: 'rgba(255,255,255,0.3)' }} />
                  </Tooltip>
                </Box>
              </Box>

              {/* Flip Hint */}
              <Typography sx={{ 
                textAlign: 'center', 
                fontSize: '0.6rem', 
                color: 'rgba(255,255,255,0.25)', 
                mt: 1.5,
                letterSpacing: '0.05em'
              }}>
                TAP TO VIEW QR CODE
              </Typography>
            </Box>
          </Box>

          {/* ==================== BACK FACE ==================== */}
          <Box
            sx={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              borderRadius: 4,
              overflow: 'hidden',
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              boxShadow: `0 25px 50px -12px rgba(0,0,0,0.7), ${roleStyle.glow}`,
              border: `2px solid ${roleStyle.border}`,
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: noisePattern,
                opacity: 0.04,
                mixBlendMode: 'overlay',
                pointerEvents: 'none',
                zIndex: 1
              }
            }}
          >
            {/* Guilloché Pattern */}
            <Box sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: guillocheSvg,
              backgroundSize: '80px 80px',
              opacity: 0.5,
              zIndex: 1
            }} />

            {/* Back Content */}
            <Box sx={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', p: 2.5 }}>
              
              {/* Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }}>
                  SCAN TO VERIFY
                </Typography>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>
                  {orgId?.substring(0, 8) || 'ORG-ID'}
                </Typography>
              </Box>

              {/* Large QR Code */}
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                flex: 1,
                mb: 2
              }}>
                <Box sx={{ 
                  p: 2, 
                  bgcolor: '#fff', 
                  borderRadius: 3,
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)'
                }}>
                  <QRCode value={qrValue} size={160} level="H" />
                </Box>
              </Box>

              {/* Metadata Section */}
              <Box sx={{ 
                bgcolor: 'rgba(0,0,0,0.4)', 
                borderRadius: 2, 
                p: 2,
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <Box sx={{ display: 'grid', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <ContactPhoneIcon sx={{ fontSize: 16, color: roleStyle.accent }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
                        EMERGENCY CONTACT
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>
                        {emergencyContact}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <MedicalIcon sx={{ fontSize: 16, color: roleStyle.accent }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
                        DEPARTMENT
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>
                        {department}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CalendarIcon sx={{ fontSize: 16, color: roleStyle.accent }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
                        JOINED
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>
                        {formattedJoinDate}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>

              {/* Return Address */}
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
                  If found, please return to {orgName}
                </Typography>
              </Box>

              {/* Flip Hint */}
              <Typography sx={{ 
                textAlign: 'center', 
                fontSize: '0.6rem', 
                color: 'rgba(255,255,255,0.25)', 
                mt: 1,
                letterSpacing: '0.05em'
              }}>
                TAP TO VIEW FRONT
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Action Buttons */}
      {showActions && (
        <Box sx={{ 
          display: 'flex', 
          gap: 1.5, 
          mt: 2,
          justifyContent: 'center'
        }}>
          <Button 
            variant="contained" 
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            startIcon={<DownloadIcon />}
            sx={{ 
              bgcolor: roleStyle.accent, 
              color: '#0f172a',
              '&:hover': { bgcolor: roleStyle.colors[0], color: '#fff' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              px: 2.5,
              boxShadow: `0 4px 20px ${roleStyle.accent}50`
            }}
          >
            Download
          </Button>
          <Tooltip title="Share Card">
            <IconButton 
              onClick={(e) => { e.stopPropagation(); handleShare(); }}
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.05)', 
                color: roleStyle.accent,
                borderRadius: 2,
                border: `1px solid ${roleStyle.border}`,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
              }}
            >
              <ShareIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy Employee Code">
            <IconButton 
              onClick={(e) => { e.stopPropagation(); handleCopyCode(); }}
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.05)', 
                color: roleStyle.accent,
                borderRadius: 2,
                border: `1px solid ${roleStyle.border}`,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
              }}
            >
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
};

export default TeamMemberIDCard;