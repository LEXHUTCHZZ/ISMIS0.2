import Link from "next/link";

export default function Home() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: "url('https://www.pcc.edu.jm/img/blog-img/1.jpg')", // Background image
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="bg-white bg-opacity-40 p-10 rounded-xl shadow-xl max-w-lg w-full text-center">
        {/* Logo */}
        <img
          src="https://media-hosting.imagekit.io/be29cbf7d4be4b4b/logo.jpg?Expires=1837986288&Key-Pair-Id=K2ZIVPTIP2VGHC&Signature=NhmaqjhDNK7hafE01qp4AnyZDZeTuCWRMyJMujOU0ceNAjZ1I9rT23pvqUyBuyrIfu16xlHMU1uQEkQnNBKlBBD4Xp10~nOdIjmaG3B346wO4R-7vUivqE49WLsLxgjMUAzWrKmFXosZprN~JNh3Qdl5ryNz1e3OxPoc0OtVM3wDEFj6F9miCumCLUjtqq8Zxjp-sneyyaca6oDXJUYOkhEHiixJIeQO~3XIvyFVrYCUN8TVsnHoJx7BrsiZoJiDJ3sEAbA6toBsB3E2QVyEyvGy8OMgHmBvAqpnX8zbLjjVnxLymbm9XvIzPVCV~G-eSGYUPuLcee411RgvhVJDfA__"
          alt="ISMIS Logo"
          className="mx-auto mb-6"
          style={{ width: "180px", height: "auto" }}
        />
        
        {/* System Name and Version */}
        <h1 className="text-5xl font-extrabold text-red-800 mb-3">Welcome to ISMIS v1.0.0</h1>
        <p className="text-gray-900 text-lg font-medium mb-5">
          Integrated Student Management Information System
        </p>

        {/* Company Details */}
        <div className="text-gray-900 mb-6">
          <p><strong>Company:</strong> Dyno Tech</p>
          <p><strong>Slogan:</strong> Don’t Be Static, Be Dynamic</p>
          <p><strong>Mission:</strong> To provide innovative, adaptable tech solutions that boost efficiency and inspire progress in a dynamic digital landscape.</p>
          <p><strong>Vision:</strong> Fully automated education systems for the future.</p>
        </div>

        {/* Problem and Solution */}
        <div className="text-gray-900 mb-6">
          <p><strong>The Problem:</strong> Manual processes waste time and invite errors in student management.</p>
          <p><strong>Our Solution:</strong> ISMIS offers intuitive dashboards for seamless management of grades, payments, and clearances.</p>
        </div>

        {/* Login/Register Buttons */}
        <div className="flex justify-center space-x-6">
          <Link
            href="/auth/login"
            className="bg-red-800 text-white px-8 py-3 rounded-lg hover:bg-red-700 transition-colors font-semibold"
          >
            Login
          </Link>
          <Link
            href="/auth/register"
            className="bg-red-800 text-white px-8 py-3 rounded-lg hover:bg-red-700 transition-colors font-semibold"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}