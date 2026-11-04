export default function CampusOverview() {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="page-top-bar no-print">
        <div className="page-top-bar-text">
          <h1>Campus Overview</h1>
          <p>Placeholder tab for campus-wide leadership insights and branch performance.</p>
        </div>
      </header>

      <div className="page-container">
        <div className="m-card" style={{ padding: '1.5rem' }}>
          <h3 className="m-card-title" style={{ marginBottom: '0.5rem' }}>Mock Campus Summary</h3>
          <p style={{ margin: 0, color: '#64748B', fontSize: '0.875rem' }}>
            This placeholder will be replaced by the final Campus Overview implementation.
          </p>
        </div>
      </div>
    </div>
  );
}
