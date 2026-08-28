import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col items-center justify-center py-20 px-4">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="relative z-10 max-w-3xl w-full bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-sm">
        <h1 className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
          Privacy Policy
        </h1>
        
        <div className="space-y-6 text-white/70">
          <p>
            Welcome to CreatorMind. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data and tell you about your privacy rights.
          </p>
          
          <h2 className="text-2xl font-semibold text-white">1. Data We Collect</h2>
          <p>
            When you connect your YouTube account, we request read-only access to your YouTube Analytics and Channel Data. We use this exclusively to analyze performance and generate content ideas.
          </p>
          
          <h2 className="text-2xl font-semibold text-white">2. How We Use Your Data</h2>
          <p>
            We use the data collected from the YouTube API to train your personal AI "Mind" on your unique content style and audience preferences. We do not sell or share your personal data with third parties.
          </p>

          <h2 className="text-2xl font-semibold text-white">3. Data Security</h2>
          <p>
            Your YouTube API tokens are encrypted at rest. Our systems use industry-standard security measures to prevent unauthorized access.
          </p>

          <h2 className="text-2xl font-semibold text-white">4. YouTube Terms of Service</h2>
          <p>
            By using CreatorMind's YouTube integration, you are agreeing to be bound by the YouTube Terms of Service (https://www.youtube.com/t/terms) and Google Privacy Policy (https://policies.google.com/privacy).
          </p>
          
          <h2 className="text-2xl font-semibold text-white">5. Revoking Access</h2>
          <p>
            You can revoke CreatorMind's access to your data via the Google security settings page at https://security.google.com/settings/security/permissions.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <Link to="/">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
