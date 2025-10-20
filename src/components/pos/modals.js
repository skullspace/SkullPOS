import React from "react";
import { Box, Button, Modal } from "@mui/joy";
const Modals = ({
    cashModalOpen,
    setCashModalOpen,
    checkoutSuccess,
    setCheckoutSuccess,
    checkoutError,
    setCheckoutError,
    transactionInProgress,
    amountReceived,
    setAmountReceived,
    handleCashPayment,
    changeDue,
    formatCAD,
}) => {

    if (transactionInProgress) {
        return (
            <Modal open>
                <Box sx={{ p: 2 }}>
                    <h3>Transaction In Progress</h3>
                    <p>Please wait...</p>
                </Box>
            </Modal>
        );
    }

    if (checkoutError) {
        return (
            <Modal open onClose={() => setCheckoutError(false)}>
                <Box sx={{ p: 2 }}>
                    <h3>Checkout Failed</h3>
                    <p>{checkoutError}</p>
                </Box>
            </Modal>
        );
    }

    if (cashModalOpen) {
        return (
            <Modal open={cashModalOpen} onClose={() => setCashModalOpen(false)}>
                <Box sx={{ p: 2 }}>
                    <h3>Cash Payment</h3>
                    <p>Enter Amount Received:</p>
                    <input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                    />
                    <Button onClick={handleCashPayment}>Submit</Button>
                </Box>
            </Modal>
        );
    }

    if (checkoutSuccess) {
        return (
            <Modal
                open={checkoutSuccess}
                onClose={() => {
                    setCheckoutSuccess(false);
                }}
            >
                <Box sx={{ p: 2 }}>
                    {changeDue > 0 && <p>Change Due: {formatCAD(changeDue)}</p>}
                    <h3>Checkout Successful</h3>
                </Box>
            </Modal>
        );
    }

    return null;
};

export default Modals;
