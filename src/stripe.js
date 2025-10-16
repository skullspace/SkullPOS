
import { useMemo, useState, useEffect, useCallback } from 'react';

export function useStripe() {
    const [stripe, setStripe] = useState(null);

    useEffect(() => {
        if (!stripe) {
            const loadStripe = async () => {
                const stripeModule = await import('@stripe/stripe-js');
                const stripeInstance = await stripeModule.loadStripe('your-publishable-key-here');
                setStripe(stripeInstance);
            };
            loadStripe();
        }
    }, [stripe]);
    return useMemo(() => stripe, [stripe]);

}
