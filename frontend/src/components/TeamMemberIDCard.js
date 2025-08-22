import React, { useMemo, useRef } from 'react';
import { Card, CardContent, CardActions, Avatar, Typography, Box, Chip, Button, Divider, Tooltip } from '@mui/material';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';

/*
  Reusable Team Member ID Card
  Props:
    - member: {
        userId, name, email, role, phone, profilePhoto, skills: string[], joinDate
      }
    - orgName: string
    - orgId: string
    - showActions: boolean (show Download button)
*/
const TeamMemberIDCard = ({ member = {}, orgName = 'Autoflow Studio', orgId = '', showActions = true }) => {
  const cardRef = useRef(null);

  const primarySkill = useMemo(() => (member?.skills && member.skills[0]) || 'Team Member', [member]);
  const qrValue = useMemo(() => {
    // Encode minimal verification payload
    return JSON.stringify({ t: 'team-id', uid: member?.userId, org: orgId, n: member?.name, r: member?.role });
  }, [member, orgId]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#0b1020' });
      const link = document.createElement('a');
      link.download = `${member?.name || 'team'}-id-card.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Failed to download ID card', e);
    }
  };

  return (
    <Card
      ref={cardRef}
      sx={{
        overflow: 'hidden',
        borderRadius: 3,
        bgcolor: '#0b1020',
        color: '#e6e8ef',
        boxShadow: '0 12px 30px rgba(2,12,27,0.5)',
        position: 'relative',
      }}
    >
      {/* Decorative gradient header */}
      <Box sx={{
        height: 84,
        background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 50%, #22c55e 100%)',
      }} />

      <CardContent sx={{ pt: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: -6 }}>
          <Avatar
            src={member?.profilePhoto || ''}
            alt={member?.name || 'Team Member'}
            sx={{ width: 84, height: 84, border: '3px solid #0b1020', boxShadow: '0 0 0 4px rgba(255,255,255,0.15)' }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>{member?.name || 'Unknown Member'}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
              <Chip size="small" color="primary" label={member?.role || 'Crew'} sx={{ bgcolor: 'primary.main', color: 'white' }} />
              <Chip size="small" variant="outlined" label={primarySkill} sx={{ borderColor: 'rgba(230,232,239,0.2)', color: '#e6e8ef' }} />
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.8, mt: 0.5 }}>
              {orgName}
            </Typography>
          </Box>
          <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
            <QRCode value={qrValue} size={72} bgColor="transparent" fgColor="#e6e8ef" />
          </Box>
        </Box>

        <Divider sx={{ my: 2, borderColor: 'rgba(230,232,239,0.08)' }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>ID</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{member?.userId || '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>Email</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={member?.email}>
              {member?.email || '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>Phone</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{member?.phone || '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>Valid</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Active</Typography>
          </Box>
        </Box>

        {member?.skills?.length ? (
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {member.skills.slice(0, 6).map((s) => (
              <Chip key={s} label={s} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#e6e8ef' }} />
            ))}
            {member.skills.length > 6 && (
              <Tooltip title={member.skills.join(', ')}>
                <Chip label={`+${member.skills.length - 6}`} size="small" variant="outlined" sx={{ borderColor: 'rgba(230,232,239,0.2)', color: '#e6e8ef' }} />
              </Tooltip>
            )}
          </Box>
        ) : null}
      </CardContent>

      {showActions && (
        <CardActions sx={{ p: 2, pt: 0, display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="contained" color="primary" onClick={handleDownload}>Download PNG</Button>
          <Button variant="outlined" color="inherit" onClick={() => navigator.clipboard.writeText(member?.userId || '')}>Copy ID</Button>
        </CardActions>
      )}
    </Card>
  );
};

export default TeamMemberIDCard;
