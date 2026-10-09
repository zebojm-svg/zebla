export type StoryPictogramName =
  | 'text'
  | 'pictures'
  | 'play'
  | 'world'
  | 'person'
  | 'room'
  | 'chair'
  | 'sketch'

const ICONS: Record<StoryPictogramName, { label: string; path: string }> = {
  text: {
    label: 'Text',
    path: 'M5 6h14M5 12h10M5 18h12',
  },
  pictures: {
    label: 'Bilder',
    path: 'M4 7h10v10H4zM10 10h10v10H10z',
  },
  play: {
    label: 'Abspielen',
    path: 'M8 6l12 6-12 6z',
  },
  world: {
    label: 'Welt',
    path: 'M12 4a8 8 0 100 16 8 8 0 000-16zM4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16',
  },
  person: {
    label: 'Figuren',
    path: 'M12 8a3.2 3.2 0 100-6.4A3.2 3.2 0 0012 8zM6 21v-1.4A6 6 0 0112 14a6 6 0 016 5.6V21',
  },
  room: {
    label: 'Räume',
    path: 'M3 21V9l9-6 9 6v12H3zM9 21v-8h6v8',
  },
  chair: {
    label: 'Möbel',
    path: 'M7 11h10v4H7zM8 15v6M16 15v6M7 11V6h3',
  },
  sketch: {
    label: 'Skizzen',
    path: 'M5 19l4-1 10-10-3-3L6 15l-1 4z',
  },
}

export function StoryPictogram({
  name,
  title,
}: {
  name: StoryPictogramName
  title?: string
}) {
  const icon = ICONS[name]
  return (
    <svg
      className="story-pictogram"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title ?? icon.label}
    >
      {title ? <title>{title}</title> : null}
      <path
        d={icon.path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
