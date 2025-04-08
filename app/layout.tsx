import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";
import StripeProvider from "../components/StripeProvider";
import { AuthProvider } from "../contexts/AuthContext"; // Import AuthProvider

export const metadata: Metadata = {
  title: "ISMIS - Student Portal",
  description: "Integrated Student Management Information System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <StripeProvider>
            <main>{children}</main>
          </StripeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}