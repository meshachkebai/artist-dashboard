export const ContributorBadge = ({ artist, role }) => {
  return (
    <span className={`contributor-badge role-${role}`}>
      {artist.name}
      {artist.has_account && <span className="verified"> ✓</span>}
      {role !== 'primary' && role !== 'headliner' && (
        <span className="role-label"> ({role})</span>
      )}
    </span>
  );
};
