import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="h-[100dvh] w-full bg-background text-foreground selection:bg-primary/20 flex flex-col overflow-hidden">
            <header className="px-6 py-4 flex items-center justify-between border-b border-border/40 bg-background/50 backdrop-blur-md shrink-0 z-50">
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                    Chroma<span className="font-light text-foreground">Glow</span>
                </h1>
                <div id="header-actions" className="flex items-center gap-4"></div>
            </header>
            <main className="flex-1 min-h-0 relative flex flex-col">
                {children}
            </main>
        </div>
    );
};
