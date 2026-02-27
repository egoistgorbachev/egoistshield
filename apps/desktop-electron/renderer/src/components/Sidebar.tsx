import { Shield, Zap, History, Globe, Settings as SettingsIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore, type Screen } from "../store/useAppStore";

export function Sidebar() {
    const currentScreen = useAppStore(s => s.currentScreen);
    const setScreen = useAppStore(s => s.setScreen);

    return (
        <nav className="relative z-20 w-20 flex flex-col items-center py-8 bg-black/40 backdrop-blur-xl border-r border-white/5 h-full">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 flex items-center justify-center mb-12 shadow-lg">
                <Shield className="w-6 h-6 text-white" />
            </div>

            <div className="flex flex-col gap-6 flex-1">
                <NavItem
                    icon={<Globe />}
                    active={currentScreen === 'dashboard'}
                    onClick={() => setScreen('dashboard')}
                />
                <NavItem
                    icon={<Zap />}
                    active={currentScreen === 'split-tunnel'}
                    onClick={() => setScreen('split-tunnel')}
                />
                <NavItem
                    icon={<History />}
                    active={currentScreen === 'logs'}
                    onClick={() => setScreen('logs')}
                />
            </div>

            <NavItem
                icon={<SettingsIcon />}
                active={currentScreen === 'settings'}
                onClick={() => setScreen('settings')}
            />
        </nav>
    );
}

function NavItem({ icon, active, onClick }: { icon: React.ReactNode; active?: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
                active
                    ? "bg-white/10 text-white shadow-inner border border-white/10"
                    : "text-white/40 hover:text-white hover:bg-white/5"
            )}
        >
            {icon}
        </button>
    );
}
