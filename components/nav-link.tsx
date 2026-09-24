import Link from "next/link";
import { Button } from "./ui/button";
import type { ReactNode } from "react";

export default function NavLink({icon, label, url}: {icon: ReactNode, label: string, url: string}) {
	return (
		<>
			<Button
				asChild
				variant="ghost"
				className="inline-flex max-sm:hidden max-md:text-xs"
			>
				<Link href={url}>
					{icon}
					{label}
				</Link>
			</Button>
			<Button
				asChild
				variant="ghost"
				className="hidden max-sm:inline-flex"
				size="icon"
				aria-label={label}
			>
				<Link href={url}>
					{icon}
				</Link>
			</Button>
		</>
	)
}