import { LanguageSwitch } from '../LanguageSwitch';

export function Header() {
    return (
        <header className="flex items-center justify-end px-8 py-5">
            <LanguageSwitch variant="ethereal" />
        </header>
    );
}
