import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Upload } from 'lucide-react';

interface DropzoneProps {
    onFiles: (files: File[]) => void;
    className?: string;
    children?: React.ReactNode;
}

export function Dropzone({ onFiles, className, children }: DropzoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files?.length) {
            onFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleClick = () => {
        inputRef.current?.click();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            onFiles(Array.from(e.target.files));
        }
    };

    return (
        <div
            className={clsx('dropzone', isDragOver && 'active', className)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input
                ref={inputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleChange}
            />
            {children || (
                <div className="center-col">
                    <Upload className="mb-2" size={24} />
                    <p>Drop files here or click to select</p>
                </div>
            )}
        </div>
    );
}
