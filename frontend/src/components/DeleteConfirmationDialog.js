import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

const DeleteConfirmationDialog = ({ open, onClose, onConfirm, clientName }) => {
    return (
        <Dialog
            open={open}
            onClose={onClose}
        >
            <DialogTitle>Delete Client?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Are you sure you want to deactivate the client "{clientName}"? This action will disable their account and cannot be undone through the UI.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={onConfirm} color="error" autoFocus>
                    Deactivate
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default DeleteConfirmationDialog;
