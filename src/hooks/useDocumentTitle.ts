import { useEffect } from 'react';

export function useDocumentTitle(name: string): void {
    useEffect(() => {
        document.title = (name ? name + ' – ' : '') + "Trainer's License";
    }, [name]);
}
