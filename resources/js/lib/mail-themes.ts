import type { Preferences } from './mail';

export const mailThemes: {
    value: Preferences['palette'];
    name: string;
    description: string;
}[] = [
    {
        value: 'default',
        name: 'WebMail',
        description: 'Clear blue, familiar and focused.',
    },
    {
        value: 'ocean',
        name: 'Ocean',
        description: 'Cool teal with a little breathing room.',
    },
    {
        value: 'forest',
        name: 'Forest',
        description: 'Soft greens for a calmer inbox.',
    },
    {
        value: 'terracotta',
        name: 'Terracotta',
        description: 'Warm clay and paper tones.',
    },
    {
        value: 'plum',
        name: 'Plum',
        description: 'Muted violet with a gentle contrast.',
    },
    {
        value: 'graphite',
        name: 'Graphite',
        description: 'Quiet neutrals, down to the details.',
    },
];
