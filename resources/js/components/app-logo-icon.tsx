import type { SVGAttributes } from 'react';

export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg
            {...props}
            viewBox="0 0 40 40"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <rect x="1" y="1" width="38" height="38" rx="11" fill="#0b57d0" />
            <rect
                x="9"
                y="12"
                width="22"
                height="17"
                rx="2"
                fill="none"
                stroke="white"
                strokeWidth="1.8"
            />
            <path
                d="m10 14 10 7 10-7"
                fill="none"
                stroke="white"
                strokeWidth="1.8"
            />
        </svg>
    );
}
