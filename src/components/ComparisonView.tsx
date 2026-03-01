import React from 'react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Plus, Minus, Maximize } from 'lucide-react';

interface ComparisonViewProps {
    originalUrl: string;
    processedUrl: string;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ originalUrl, processedUrl }) => {
    const [isShiftPressed, setIsShiftPressed] = React.useState(false);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftPressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftPressed(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return (
        <div className="rounded-xl overflow-hidden border border-border shadow-2xl bg-card w-full h-full relative group/zoom">
            <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={8}
                centerOnInit
                wheel={{ step: 0.1 }}
                panning={{ activationKeys: ['Shift'] }}
                doubleClick={{ disabled: false }}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        {/* Controls */}
                        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 opacity-0 group-hover/zoom:opacity-100 transition-opacity">
                            <button onClick={() => zoomIn()} className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm border border-white/10 shadow-lg transition-transform hover:scale-105" title="Zoom In">
                                <Plus className="w-5 h-5" />
                            </button>
                            <button onClick={() => zoomOut()} className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm border border-white/10 shadow-lg transition-transform hover:scale-105" title="Zoom Out">
                                <Minus className="w-5 h-5" />
                            </button>
                            <button onClick={() => resetTransform()} className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm border border-white/10 shadow-lg transition-transform hover:scale-105" title="Reset Zoom">
                                <Maximize className="w-5 h-5" />
                            </button>
                            <div className="px-2 py-1 bg-black/40 text-white/70 text-[10px] rounded-sm text-center font-medium backdrop-blur-sm select-none">
                                Hold Shift<br />to Pan
                            </div>
                        </div>

                        <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
                            <div className={isShiftPressed ? "pointer-events-none w-full h-full" : "w-full h-full"}>
                                <ReactCompareSlider
                                    itemOne={<ReactCompareSliderImage src={originalUrl} style={{ objectFit: 'contain', width: '100%', height: '100%' }} alt="Original" />}
                                    itemTwo={<ReactCompareSliderImage src={processedUrl} style={{ objectFit: 'contain', width: '100%', height: '100%' }} alt="Colorized" />}
                                    className="w-full h-full"
                                    style={{ height: '100%', width: '100%' }}
                                />
                            </div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        </div>
    );
};
