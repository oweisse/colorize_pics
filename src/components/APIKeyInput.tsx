import React, { useState, useEffect } from 'react';
import { Key, List } from 'lucide-react';
import { getAvailableModels } from '../lib/gemini';

interface APIKeyInputProps {
    onKeySubmit: (key: string) => void;
    savedKey: string;
}

export const APIKeyInput: React.FC<APIKeyInputProps> = ({ onKeySubmit, savedKey }) => {
    const [key, setKey] = useState(savedKey);

    useEffect(() => {
        setKey(savedKey);
    }, [savedKey]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onKeySubmit(key);
    };

    const handleListModels = async () => {
        if (!key) {
            alert("Please enter an API Key first.");
            return;
        }
        try {
            const models = await getAvailableModels(key);
            alert("Available Models for your key:\n" + (models.length ? models.join("\n") : "No models found or API returned empty list."));
        } catch (e) {
            alert("Failed to list models. Check console for details.");
        }
    };

    return (
        <div className="bg-card/50 backdrop-blur-sm border border-border p-4 rounded-xl flex items-center gap-4 shadow-sm w-full max-w-md">
            <Key className="text-primary w-5 h-5" />
            <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
                <input
                    type="text"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="Enter Google Gemini API Key"
                    className="bg-transparent border-none focus:ring-0 text-foreground placeholder:text-muted-foreground w-full font-mono text-sm"
                />
                <button
                    type="submit"
                    className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-md hover:bg-primary/90 transition-colors"
                >
                    Save
                </button>
                <button
                    type="button"
                    onClick={handleListModels}
                    title="Check available models"
                    className="text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-1"
                >
                    <List className="w-3 h-3" />
                </button>
            </form>
        </div>
    );
};
