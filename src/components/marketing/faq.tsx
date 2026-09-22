'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export interface FaqItem {
  question: string
  answer: string
}

/** Accessible FAQ accordion (single-open), keyboard navigable via shadcn/Radix. */
export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <Accordion type="single" collapsible className={className}>
      {items.map((item, i) => (
        <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border/70 last:border-b-0">
          <AccordionTrigger className="py-5 text-left text-base font-medium hover:text-foreground hover:no-underline sm:text-lg [&>svg]:size-5">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="pb-6 text-base leading-relaxed text-muted-foreground">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
