import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { clsx } from 'clsx';

interface FileUploadProps {
    onUpload: (files: File[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        onUpload(acceptedFiles);
    }, [onUpload]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.webp']
        },
        multiple: true
    });

    return (
        <div
            {...getRootProps()}
            className={clsx(
                "cursor-pointer border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center transition-all duration-300 ease-in-out group",
                isDragActive
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : "border-border hover:border-primary/50 hover:bg-card/50"
            )}
        >
            <input {...getInputProps()} />
            <div className={clsx(
                "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors",
                isDragActive ? "bg-primary text-white" : "bg-card text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
            )}>
                <UploadCloud className="w-8 h-8" />
            </div>
            <p className="text-lg font-medium text-foreground mb-1">
                {isDragActive ? "Drop memories here" : "Upload black & white photos"}
            </p>
            <p className="text-sm text-muted-foreground">
                Drag & drop or click to select files
            </p>
        </div>
    );
};
