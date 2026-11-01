import * as Dialog from '@radix-ui/react-dialog';
import { X, type LucideIcon, Mail } from 'lucide-react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
export function IconButton({
    icon: Icon,
    label,
    ...props
}: {
    icon: LucideIcon;
    label: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className="icon-button"
            aria-label={label}
            title={label}
            {...props}
        >
            <Icon size={19} strokeWidth={1.7} />
        </button>
    );
}
export function Brand() {
    return (
        <span className="brand">
            <span className="brand-mark">
                <Mail size={21} strokeWidth={1.7} />
            </span>
            <span>Postroom</span>
        </span>
    );
}
export function Sheet({
    open,
    onClose,
    title,
    children,
    side = 'right',
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    side?: 'right' | 'left' | 'bottom';
}) {
    return (
        <Dialog.Root
            open={open}
            onOpenChange={(value) => {
                if (!value) onClose();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="sheet-overlay" />
                <Dialog.Content
                    className={`sheet sheet-${side}`}
                    aria-describedby={undefined}
                >
                    <div className="sheet-heading">
                        <Dialog.Title>{title}</Dialog.Title>
                        <Dialog.Close asChild>
                            <IconButton icon={X} label={`Close ${title}`} />
                        </Dialog.Close>
                    </div>
                    {children}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
