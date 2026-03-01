import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface ResizableSidebarProps {
    children: React.ReactNode;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
    children,
    defaultWidth = 420,
    minWidth = 200,
    maxWidth = 600,
}) => {
    const [width, setWidth] = useState(defaultWidth);
    const [isResizing, setIsResizing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const startResizing = React.useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing && sidebarRef.current) {
                const newWidth = mouseMoveEvent.clientX - sidebarRef.current.getBoundingClientRect().left;
                if (newWidth >= minWidth && newWidth <= maxWidth) {
                    setWidth(newWidth);
                }
            }
        },
        [isResizing, minWidth, maxWidth]
    );

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <>
            <div
                ref={sidebarRef}
                className={clsx(
                    "relative flex flex-col border-r border-border bg-card/50 backdrop-blur-sm transition-all duration-300 ease-in-out shrink-0",
                    isCollapsed ? "w-12 items-center" : ""
                )}
                style={{ width: isCollapsed ? undefined : width }}
            >
                {/* Collapse Toggle */}
                <div className="flex items-center justify-between p-2 border-b border-border/40 h-14">
                    {/* Only show title if not collapsed */}
                    {!isCollapsed && <div className="text-xs font-semibold uppercase tracking-wider pl-2 text-muted-foreground">Gallery</div>}

                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"
                        title={isCollapsed ? "Expand Gallery" : "Collapse Gallery"}
                    >
                        {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                    </button>
                </div>

                {/* Content */}
                <div className={clsx("flex-1 overflow-hidden", isCollapsed ? "invisible" : "visible")}>
                    {children}
                </div>

                {/* Drag Handle */}
                {!isCollapsed && (
                    <div
                        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-50 opacity-0 hover:opacity-100 active:opacity-100 active:bg-primary"
                        onMouseDown={startResizing}
                    />
                )}
            </div>

            {/* Overlay when resizing to prevent iframe stealing events if any (though we don't have iframes, good practice) */}
            {isResizing && <div className="fixed inset-0 z-[9999] cursor-col-resize" />}
        </>
    );
};
