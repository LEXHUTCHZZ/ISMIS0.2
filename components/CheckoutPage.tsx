// components/CheckoutPage.tsx
"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";
import { db } from "../lib/firebase";
import { doc, getDoc, updateDoc, collection, addDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

// Initialize Stripe with your publishable key from .env.local
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

const CheckoutForm = ({ onPaymentSuccess }: { onPaymentSuccess?: () => void }) => {
  const [amountJMD, setAmountJMD] = useState<number | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(157.19);
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();

  const convertToUSD = (jmd: number) => jmd / exchangeRate;
  const convertToCents = (usd: number) => Math.round(usd * 100);

  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
        const data = await response.json();
        if (!data.rates || !data.rates.JMD) {
          throw new Error("Invalid exchange rate data");
        }
        const rate = data.rates.JMD;
        console.log("Fetched exchange rate:", rate);
        setExchangeRate(rate);
      } catch (err) {
        console.error("Failed to fetch exchange rate:", err);
        setError("Couldn’t fetch exchange rate; using default 157.19 JMD/USD.");
      }
    };
    fetchExchangeRate();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError("Payment system not loaded. Please try again.");
      return;
    }

    if (!user) {
      setError("User not authenticated. Please log in.");
      return;
    }

    if (!amountJMD || amountJMD <= 0) {
      setError("Please enter a valid amount greater than 0 JMD.");
      return;
    }

    if (amountJMD > 1000000) {
      setError("Amount too large. Maximum allowed is 1,000,000 JMD.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card element not found.");
      setIsProcessing(false);
      return;
    }

    const amountUSD = convertToUSD(amountJMD);
    const amountInCents = convertToCents(amountUSD);
    console.log("User Input (JMD):", amountJMD);
    console.log("Exchange Rate:", exchangeRate);
    console.log("Converted to USD:", amountUSD.toFixed(2));
    console.log("Converted to Cents (sent to Stripe):", amountInCents);

    if (amountInCents < 50) {
      setError("Amount too small after conversion. Minimum is 50 cents USD.");
      setIsProcessing(false);
      return;
    }

    if (amountInCents > 100000) {
      setError("Amount too large after conversion. Please reduce the amount.");
      setIsProcessing(false);
      return;
    }

    try {
      const { error: paymentError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
      });

      if (paymentError) {
        setError(paymentError.message ?? "An error occurred while creating the payment method.");
        setIsProcessing(false);
        return;
      }

      console.log("Sending to API - Amount in cents:", amountInCents);
      const response = await axios.post("/api/create-payment-intent", {
        amount: amountInCents,
      });
      const { clientSecret } = response.data;
      if (!clientSecret) {
        throw new Error("Failed to retrieve client secret from server.");
      }
      console.log("Received clientSecret from API");

      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: paymentMethod.id,
      });

      if (confirmError) {
        setError(confirmError.message ?? "An error occurred while confirming the payment.");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent.status === "succeeded") {
        console.log("Payment succeeded with amount (cents):", paymentIntent.amount);

        const studentDoc = doc(db, "students", user.uid);
        const studentSnap = await getDoc(studentDoc);
        const studentData = studentSnap.data();

        if (!studentData) {
          setError("Student data not found.");
          setIsProcessing(false);
          return;
        }

        const newTotalPaid = (studentData.totalPaid || 0) + amountJMD;
        const balance = studentData.totalOwed - newTotalPaid;
        const paymentStatus = balance <= 0 ? "Paid" : newTotalPaid > 0 ? "Partially Paid" : "Unpaid";
        const paymentPlan = studentData.paymentPlan || { installments: [] };

        let remainingPayment = amountJMD;
        const updatedInstallments = paymentPlan.installments.map((inst: any) => {
          if (remainingPayment >= inst.amount && !inst.paid) {
            remainingPayment -= inst.amount;
            return { ...inst, paid: true };
          }
          return inst;
        });

        const firstInstallmentPaid = updatedInstallments.length > 0 && updatedInstallments[0].paid && !studentData.clearance;

        // Save transaction to Firestore
        const transactionRef = collection(studentDoc, "transactions");
        await addDoc(transactionRef, {
          amount: amountJMD,
          date: new Date().toISOString(),
          paymentIntentId: paymentIntent.id,
          status: "succeeded",
        });

        try {
          await updateDoc(studentDoc, {
            totalPaid: newTotalPaid,
            balance,
            paymentStatus,
            paymentPlan: { ...paymentPlan, installments: updatedInstallments },
            clearance: firstInstallmentPaid || balance <= 0,
          });
          console.log("Firestore updated: totalPaid:", newTotalPaid, "balance:", balance);
        } catch (firestoreError: any) {
          setError("Payment processed, but failed to update student record: " + firestoreError.message);
          setIsProcessing(false);
          return;
        }

        setPaymentSuccess(true);

        if (onPaymentSuccess) {
          onPaymentSuccess();
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Payment failed.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label style={{ fontSize: "1rem", fontWeight: "600", color: "#7F1D1D", display: "block", marginBottom: "0.5rem" }}>
          Amount in JMD
        </label>
        <input
          type="number"
          placeholder="Enter amount in JMD (e.g., 1000)"
          value={amountJMD}
          onChange={(e) => {
            const value = e.target.value === "" ? "" : parseFloat(e.target.value);
            setAmountJMD(value);
          }}
          step="1"
          min="0"
          style={{ width: "100%", padding: "0.75rem", border: "1px solid #7F1D1D", borderRadius: "4px", color: "#7F1D1D" }}
          disabled={isProcessing || paymentSuccess}
        />
      </div>
      {amountJMD && !isProcessing && !paymentSuccess && (
        <p style={{ color: "#7F1D1D", fontSize: "0.875rem" }}>
          ≈ ${(convertToUSD(amountJMD)).toFixed(2)} USD (Rate: 1 USD = {exchangeRate.toFixed(2)} JMD)
        </p>
      )}
      <div>
        <label style={{ fontSize: "1rem", fontWeight: "600", color: "#7F1D1D", display: "block", marginBottom: "0.5rem" }}>
          Card Information
        </label>
        <div style={{ border: "1px solid #7F1D1D", borderRadius: "4px", padding: "0.75rem", backgroundColor: "#FFFFFF" }}>
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "#7F1D1D",
                  "::placeholder": { color: "#7F1D1D" },
                },
                invalid: { color: "#7F1D1D" },
              },
            }}
          />
        </div>
      </div>
      {error && <p style={{ color: "#7F1D1D", fontSize: "0.875rem" }}>{error}</p>}
      <button
        type="submit"
        disabled={isProcessing || paymentSuccess || !stripe || !elements || !amountJMD}
        style={{
          width: "100%",
          padding: "0.75rem",
          borderRadius: "4px",
          backgroundColor: isProcessing ? "#D1D5DB" : paymentSuccess ? "#16A34A" : "#7F1D1D",
          color: "#FFFFFF",
          border: "none",
          cursor: isProcessing || paymentSuccess || !stripe || !elements || !amountJMD ? "not-allowed" : "pointer",
        }}
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

export default function CheckoutPage({ onPaymentSuccess }: { onPaymentSuccess?: () => void }) {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm onPaymentSuccess={onPaymentSuccess} />
    </Elements>
  );
}