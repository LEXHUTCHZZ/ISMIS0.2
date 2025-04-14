"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import axios from "axios";
import { db } from "../lib/firebase";
import { doc, updateDoc, collection, addDoc } from "firebase/firestore";

// Initialize Stripe with validation
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// Interface for Transaction matching Dashboard
interface Transaction {
  id: string;
  amount: number;
  date: string;
  status: string;
}

interface CheckoutPageProps {
  studentId: string;
  amount: number;
  onPaymentSuccess: (transaction: Transaction) => Promise<void>;
}




const CheckoutForm = ({ amount: initialBalance, onPaymentSuccess }: CheckoutPageProps) => {
  const [amountJMD, setAmountJMD] = useState<number>(initialBalance);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(157.19); // Default JMD/USD rate
  const stripe = useStripe();
  const elements = useElements();

  const convertToUSD = (jmd: number) => jmd / exchangeRate;
  const convertToCents = (usd: number) => Math.round(usd * 100);

  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch(
          "https://api.exchangerate-api.com/v4/latest/USD"
        );
        const data = await response.json();
        if (!data.rates?.JMD) {
          throw new Error("Invalid exchange rate data");
        }
        setExchangeRate(data.rates.JMD);
      } catch (err) {
        console.error("Failed to fetch exchange rate:", err);
        setError(
          "Couldn't fetch exchange rate; using default 157.19 JMD/USD."
        );
      }
    };

    fetchExchangeRate();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !stripePromise) {
      setError("Payment system not initialized. Please contact support.");
      return;
    }

    if (!amountJMD || amountJMD <= 0) {
      setError("Please enter an amount greater than 0 JMD.");
      return;
    }

    if (amountJMD > initialBalance) {
      setError(`Amount exceeds balance of ${initialBalance.toLocaleString()} JMD.`);
      return;
    }

    if (amountJMD > 1000000) {
      setError("Amount exceeds maximum limit of 1,000,000 JMD.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card information is missing.");
      setIsProcessing(false);
      return;
    }

    const amountUSD = convertToUSD(amountJMD);
    const amountInCents = convertToCents(amountUSD);

    if (amountInCents < 50) {
      setError("Amount too small. Minimum is ~78.60 JMD (50 cents USD).");
      setIsProcessing(false);
      return;
    }

    try {
      // Create payment method
      const { error: paymentError, paymentMethod } =
        await stripe.createPaymentMethod({
          type: "card",
          card: cardElement,
        });

      if (paymentError) {
        setError(paymentError.message ?? "Invalid card details.");
        setIsProcessing(false);
        return;
      }

      // Create payment intent
      const response = await axios.post("/api/create-payment-intent", {
        amount: amountInCents,
      });
      const { clientSecret } = response.data;
      if (!clientSecret) {
        throw new Error("Failed to create payment intent.");
      }

      // Confirm payment
      const { error: confirmError, paymentIntent } =
        await stripe.confirmCardPayment(clientSecret, {
          payment_method: paymentMethod.id,
        });

      if (confirmError) {
        setError(confirmError.message ?? "Payment confirmation failed.");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent.status === "succeeded") {
        const transaction: Transaction = {
          id: paymentIntent.id,
          amount: amountJMD,
          date: new Date().toISOString(),
          status: "succeeded",
        };

        // Call onPaymentSuccess with transaction
        await onPaymentSuccess(transaction);
        setPaymentSuccess(true);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error || err.message || "Payment processing failed."
      );
      setIsProcessing(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-labelledby="payment-form"
    >
      <div>
        <label
          htmlFor="amount-jmd"
          className="block text-blue-800 font-semibold mb-2"
        >
          Amount in JMD
        </label>
        <input
          id="amount-jmd"
          type="number"
          placeholder={`Enter amount up to ${initialBalance.toLocaleString()} JMD`}
          value={amountJMD}
          onChange={(e) => {
            const value = e.target.value === "" ? 0 : parseFloat(e.target.value);
            setAmountJMD(isNaN(value) ? 0 : value);
          }}
          step="1"
          min="0"
          max={initialBalance}
          className="w-full p-2 border rounded text-blue-800 disabled:opacity-50"
          disabled={isProcessing || paymentSuccess}
          aria-describedby={error ? "amount-error" : undefined}
        />
      </div>
      {amountJMD > 0 && !isProcessing && !paymentSuccess && (
        <p className="text-blue-800 text-sm">
          ≈ ${(convertToUSD(amountJMD)).toFixed(2)} USD (Rate: 1 USD = {exchangeRate.toFixed(2)} JMD)
        </p>
      )}
      <div>
        <label
          htmlFor="card-element"
          className="block text-blue-800 font-semibold mb-2"
        >
          Card Information
        </label>
        <div className="border border-blue-800 rounded p-3 bg-white">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "#1E3A8A",
                  "::placeholder": { color: "#1E3A8A" },
                },
                invalid: { color: "#B91C1C" },
              },
            }}
          />
        </div>
      </div>
      {error && (
        <p
          id="amount-error"
          className="text-red-600 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isProcessing || paymentSuccess || !stripe || !elements || !amountJMD}
        className={`w-full px-4 py-2 rounded text-white ${
          isProcessing || paymentSuccess || !stripe || !elements || !amountJMD
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-800 hover:bg-blue-700"
        }`}
        aria-disabled={isProcessing || paymentSuccess || !stripe || !elements || !amountJMD}
      >
        {isProcessing
          ? "Processing..."
          : paymentSuccess
          ? "Payment Successful"
          : amountJMD
          ? `Pay ${amountJMD.toLocaleString()} JMD`
          : "Enter Amount to Pay"}
      </button>
    </form>
  );
};

export default function CheckoutPage({ amount, onPaymentSuccess }: CheckoutPageProps) {
  if (!stripePromise) {
    return (
      <p className="text-red-600">
        Payment system unavailable. Please contact support.
      </p>
    );
  }
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm studentId="defaultStudentId" amount={amount} onPaymentSuccess={onPaymentSuccess} />
    </Elements>
  );
}