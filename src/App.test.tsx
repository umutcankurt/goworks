import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App Component', () => {
    it('mounts and routes the unauthenticated user to onboarding by default', async () => {
        // jsdom'da window.ipcRenderer yok; AppConfigContext IPC çağrısını yutar ve
        // FALLBACK_CONFIG (companyName=''  ve onboardingCompletedAt=null) ile başlar.
        // OnboardingGate bu durumda /onboarding'e yönlendirir.
        render(<App />);
        // Onboarding welcome ekranındaki "Kuruluma başla" CTA'sını render etmeli.
        expect(
            await screen.findByRole('button', { name: /kuruluma başla|begin setup/i }),
        ).toBeInTheDocument();
    });
});
