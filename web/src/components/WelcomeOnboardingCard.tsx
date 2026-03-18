import logoUrl from "../assets/onboarding/welcome-logo.svg";
import arrowUrl from "../assets/onboarding/welcome-arrow.svg";

type WelcomeOnboardingCardProps = {
  onGetStarted?: () => void;
};

function GradientTitle({ children }: { children: string }) {
  return (
    <h1
      className="text-center text-[36px] font-bold leading-[40px] tracking-[0.3691px]"
      style={{
        WebkitTextFillColor: "transparent",
        backgroundImage:
          "linear-gradient(90deg, rgba(152, 16, 250, 1) 0%, rgba(21, 93, 252, 1) 100%)",
        backgroundClip: "text",
      }}
    >
      {children}
    </h1>
  );
}

function PrimaryButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: string;
}) {
  return (
    <button
      className="group flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-medium leading-[20px] tracking-[-0.1504px] text-white shadow-sm transition hover:brightness-105"
      onClick={onClick}
      type="button"
    >
      {children}
      <img alt="" className="h-4 w-4" src={arrowUrl} />
    </button>
  );
}

export default function WelcomeOnboardingCard({
  onGetStarted,
}: WelcomeOnboardingCardProps) {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center"
      style={{
        backgroundImage:
          "linear-gradient(148.34071158760372deg, rgba(250, 245, 255, 1) 0%, rgba(255, 255, 255, 1) 50%, rgba(239, 246, 255, 1) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)",
      }}
    >
      <div className="h-[384px] w-[672px] rounded-[16px] bg-white shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]">
        <div className="flex h-full flex-col items-center px-12 pt-12 text-center">
          <img alt="" className="h-20 w-20" src={logoUrl} />
          <div className="mt-6">
            <GradientTitle>Welcome to 8product.com</GradientTitle>
          </div>
          <p className="mt-4 max-w-[510px] text-center text-[18px] font-normal leading-[28px] tracking-[-0.4395px] text-[#4a5565]">
            Your AI-powered workspace for product management. Let&apos;s get you set up in just a
            few steps.
          </p>
          <div className="mt-8">
            <PrimaryButton onClick={onGetStarted}>Get Started</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
