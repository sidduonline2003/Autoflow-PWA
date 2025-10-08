import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

const DeleteConfirmationDialog = ({
    open,
    onClose,
    onConfirm,
    clientName,
    title,
    message,
    confirmLabel,
    confirmColor = 'error'
}) => {
    const finalTitle = title || 'Delete Client?';
    const finalMessage = message || `Are you sure you want to deactivate the client "${clientName}"? This action will disable their account and cannot be undone through the UI.`;
    const finalConfirmLabel = confirmLabel || 'Deactivate';

    return (
        <Dialog
            open={open}
            onClose={onClose}
        >
            <DialogTitle>{finalTitle}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {finalMessage}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={onConfirm} color={confirmColor} autoFocus>
                    {finalConfirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default DeleteConfirmationDialog;
