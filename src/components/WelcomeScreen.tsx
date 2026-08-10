import { useState } from "react";
import {
    Sparkles,
    Calendar,
    BarChart3,
    Award,
    Layers,
    ArrowRight,
    User
} from "lucide-react";
import { setDisplayName } from "../lib/settings";
import { markOnboardingComplete } from "../lib/onboarding-logic";

interface WelcomeScreenProps {
    onComplete: (openEntryForm?: boolean) => void;
}

const FEATURES = [
    {
        icon: Calendar,
        title: "Year View",
        description: "Browse and organize your media by year with beautiful visual timelines",
        color: "from-purple-500 to-indigo-500",
        bg: "rgba(139, 92, 246, 0.15)"
    },
    {
        icon: Layers,
        title: "Collections",
        description: "Create custom collections to group related entries together",
        color: "from-blue-500 to-cyan-500",
        bg: "rgba(59, 130, 246, 0.15)"
    },
    {
        icon: BarChart3,
        title: "Statistics",
        description: "Track your habits with detailed analytics and insights",
        color: "from-emerald-500 to-teal-500",
        bg: "rgba(16, 185, 129, 0.15)"
    },
    {
        icon: Award,
        title: "Awards",
        description: "Create yearly awards to highlight your favorites",
        color: "from-amber-500 to-orange-500",
        bg: "rgba(245, 158, 11, 0.15)"
    }
];

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
    const [name, setName] = useState("");
    const [step, setStep] = useState<"intro" | "personalize">("intro");

    const handleGetStarted = () => {
        setStep("personalize");
    };

    const handleComplete = (addEntry: boolean = false) => {
        // Save display name if provided
        if (name.trim()) {
            setDisplayName(name.trim());
        }

        // Mark onboarding as complete
        markOnboardingComplete();

        // Close welcome and optionally open entry form
        onComplete(addEntry);
    };

    return (
        <div className="welcome-overlay">
            <div className="welcome-container">
                {step === "intro" ? (
                    <>
                        {/* Hero Section */}
                        <div className="welcome-hero">
                            <div className="welcome-logo">
                                <div className="welcome-logo-icon">
                                    <Sparkles size={32} />
                                </div>
                                <div className="welcome-logo-glow" />
                            </div>
                            <h1 className="welcome-title">
                                Welcome to <span className="welcome-title-accent">Media Logger</span>
                            </h1>
                            <p className="welcome-subtitle">
                                Your personal space to track, organize, and celebrate the media you love
                            </p>
                        </div>

                        {/* Feature Cards */}
                        <div className="welcome-features">
                            {FEATURES.map((feature, index) => (
                                <div
                                    key={feature.title}
                                    className="welcome-feature-card"
                                    style={{
                                        animationDelay: `${Math.min(index * 0.1, 0.3)}s`,
                                        background: feature.bg
                                    }}
                                >
                                    <div
                                        className={`welcome-feature-icon bg-gradient-to-br ${feature.color}`}
                                    >
                                        <feature.icon size={20} />
                                    </div>
                                    <div className="welcome-feature-content">
                                        <h3 className="welcome-feature-title">{feature.title}</h3>
                                        <p className="welcome-feature-description">{feature.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* CTA Button */}
                        <button
                            className="welcome-cta"
                            onClick={handleGetStarted}
                        >
                            <span>Get Started</span>
                            <ArrowRight size={18} />
                        </button>
                    </>
                ) : (
                    <>
                        {/* Personalization Step */}
                        <div className="welcome-hero">
                            <div className="welcome-logo welcome-logo-small">
                                <div className="welcome-logo-icon">
                                    <User size={24} />
                                </div>
                            </div>
                            <h2 className="welcome-title welcome-title-small">
                                Let's personalize your experience
                            </h2>
                            <p className="welcome-subtitle">
                                What should we call you? This will appear in your dashboard greeting.
                            </p>
                        </div>

                        {/* Name Input */}
                        <div className="welcome-input-wrapper">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name (optional)"
                                className="welcome-input"
                                autoFocus
                                maxLength={30}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="welcome-actions">
                            <button
                                className="welcome-cta welcome-cta-secondary"
                                onClick={() => handleComplete(false)}
                            >
                                <span>Skip for now</span>
                            </button>
                            <button
                                className="welcome-cta"
                                onClick={() => handleComplete(true)}
                            >
                                <span>Add First Entry</span>
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    </>
                )}

                {/* Background Decorations */}
                <div className="welcome-decoration welcome-decoration-1" />
                <div className="welcome-decoration welcome-decoration-2" />
                <div className="welcome-decoration welcome-decoration-3" />
            </div>
        </div>
    );
}
