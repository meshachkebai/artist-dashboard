import { ContributorBadge } from './ContributorBadge';

export const ContributorList = ({ contributors }) => {
  if (!contributors || contributors.length === 0) return null;

  const primary = contributors.filter(c => c.role === 'primary' || c.role === 'headliner');
  const featuring = contributors.filter(c => c.role === 'featuring');
  const others = contributors.filter(c => !['primary', 'headliner', 'featuring'].includes(c.role));

  return (
    <div className="contributor-list">
      <div className="primary-artists">
        {primary.map(c => (
          <ContributorBadge key={c.artists.id} artist={c.artists} role={c.role} />
        ))}
      </div>

      {featuring.length > 0 && (
        <div className="featuring-artists">
          feat. {featuring.map(c => c.artists.name).join(', ')}
        </div>
      )}

      {others.length > 0 && (
        <div className="other-contributors">
          {others.map(c => (
            <span key={`${c.artists.id}-${c.role}`} className="contributor-item">
              {c.role}: {c.artists.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
