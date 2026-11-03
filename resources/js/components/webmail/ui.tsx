import * as Dialog from '@radix-ui/react-dialog';
import { X, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { PRODUCT_NAME, PRODUCT_BYLINE, PRODUCT_TITLE } from '@/lib/brand';
export function IconButton({
    icon: Icon,
    label,
    onClick,
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
            onClick={(event) => {
                // Safari does not focus pointer-clicked buttons by default.
                // Sheets need the invoking control as a reliable return target.
                event.currentTarget.focus({ preventScroll: true });
                onClick?.(event);
            }}
        >
            <Icon size={19} strokeWidth={1.7} />
        </button>
    );
}
export function Brand() {
    return (
        <span className="brand" role="img" aria-label={PRODUCT_TITLE}>
            <AppLogoIcon className="brand-mark" />
            <span className="brand-wordmark" aria-hidden="true">
                <span>{PRODUCT_NAME}</span> <small>{PRODUCT_BYLINE}</small>
            </span>
        </span>
    );
}
export function Sheet({
    open,
    onClose,
    title,
    children,
    side = 'right',
    branded = false,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    side?: 'right' | 'left' | 'bottom';
    branded?: boolean;
}) {
    const returnFocus = useRef<HTMLElement | null>(null);
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
                    onOpenAutoFocus={() => {
                        returnFocus.current =
                            document.activeElement instanceof HTMLElement
                                ? document.activeElement
                                : null;
                    }}
                    onCloseAutoFocus={(event) => {
                        if (
                            document.activeElement instanceof Element &&
                            document.activeElement.closest(
                                '.sheet[role="dialog"][data-state="open"]',
                            )
                        ) {
                            event.preventDefault();
                            return;
                        }
                        if (returnFocus.current?.isConnected) {
                            event.preventDefault();
                            returnFocus.current.focus({ preventScroll: true });
                        } else {
                            const fallback =
                                document.querySelector<HTMLElement>(
                                    'main[tabindex="-1"]',
                                );
                            if (fallback) {
                                event.preventDefault();
                                fallback.focus({ preventScroll: true });
                            }
                        }
                    }}
                >
                    <div className="sheet-heading">
                        <Dialog.Title>
                            {branded ? <Brand /> : title}
                        </Dialog.Title>
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
