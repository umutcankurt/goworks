import { LanguageSwitch } from '../LanguageSwitch';
import { ThemeToggle } from '../ThemeToggle';

export function Header() {
    return (
        <header className="flex items-center justify-end gap-3 px-8 py-5">
            <ThemeToggle variant="ethereal" />
            <LanguageSwitch variant="ethereal" />
        </header>
    );
}
