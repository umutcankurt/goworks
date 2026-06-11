import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App Component', () => {
    it('mounts and routes the unauthenticated user to onboarding by default', async () => {
        // In jsdom there is no window.ipcRenderer; AppConfigContext swallows the IPC call and
        // starts with FALLBACK_CONFIG (companyName='' and onboardingCompletedAt=null).
        // In this case OnboardingGate redirects to /onboarding.
        render(<App />);
        // Should render the "Begin setup" CTA on the onboarding welcome screen.
        expect(
            await screen.findByRole('button', { name: /kuruluma başla|begin setup/i }),
        ).toBeInTheDocument();
    });
});
