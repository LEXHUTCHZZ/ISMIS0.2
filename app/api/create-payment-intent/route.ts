import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function POST(req: Request) {
  console.log("API Route: STRIPE_SECRET_KEY starts with:", process.env.STRIPE_SECRET_KEY?.substring(0, 8));
  try {
    const { amount } = await req.json();
    console.log("Received amount from frontend (cents):", amount);

    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("Invalid amount provided:", amount);
      return NextResponse.json(
        { error: "Invalid amount provided" },
        { status: 400 }
      );
    }

    console.log("Sending to Stripe - Amount (cents):", amount);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in USD cents
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    console.log("PaymentIntent created - Amount (cents):", paymentIntent.amount, "ID:", paymentIntent.id);
    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    console.error("Error in /api/create-payment-intent:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}