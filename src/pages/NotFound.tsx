import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <div className="hero-orb h-80 w-80 bg-blue-300/30 left-[-6rem] top-[-3rem]" />
      <div className="hero-orb h-96 w-96 bg-purple-300/20 right-[-8rem] bottom-[-6rem]" />
      <div className="glass-card max-w-lg w-full p-10 text-center">
        <h1 className="mb-3 text-5xl font-display font-bold text-slate-900">404</h1>
        <p className="mb-6 text-lg text-slate-500">That page does not exist.</p>
        <a href="/" className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-50">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
