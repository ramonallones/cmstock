export default function PlaceholderPage({ eyebrow, title, description, icon: Icon }) {
  return (
    <section className="placeholder-card">
      <div className="placeholder-icon"><Icon size={28} /></div>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="placeholder-line" />
      <small>Modul ini siap dikembangkan pada tahap berikutnya.</small>
    </section>
  )
}
