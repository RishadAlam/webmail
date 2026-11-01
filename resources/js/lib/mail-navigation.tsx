import { createContext, useContext, useState, type ReactNode } from 'react';

type MailLocation = { url: string; position: number; focus: number | null };
const MailNavigation = createContext<{
    location: MailLocation | null;
    remember: (location: MailLocation) => void;
}>({ location: null, remember: () => {} });

// In-memory, account-scoped navigation only; never persist private page data to storage.
export function MailNavigationProvider({ children }: { children: ReactNode }) {
    const [location, remember] = useState<MailLocation | null>(null);
    return (
        <MailNavigation.Provider value={{ location, remember }}>
            {children}
        </MailNavigation.Provider>
    );
}
export const useMailNavigation = () => useContext(MailNavigation);
