import { useId, type SVGAttributes } from 'react';

export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    const maskId = `webmail-mark-${useId()}`;

    return (
        <svg
            {...props}
            viewBox="0 0 1024 544"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <mask
                    id={maskId}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width="1024"
                    height="544"
                    style={{ maskType: 'alpha' }}
                >
                    <image
                        href="/brand/webmail-mark.png"
                        width="1024"
                        height="544"
                    />
                </mask>
            </defs>
            <rect
                width="1024"
                height="544"
                fill="currentColor"
                mask={`url(#${maskId})`}
            />
        </svg>
    );
}
