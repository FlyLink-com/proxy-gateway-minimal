import { defaultNode } from "../features/subscriptions/mock-data";

export function NodesPage() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Nodes</h2>
          <p className="muted">Read-only production node view for the admin shell MVP.</p>
        </div>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Region</th>
              <th>Host</th>
              <th>Port</th>
              <th>Method</th>
              <th>Credential mode</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{defaultNode.name}</td>
              <td>{defaultNode.region}</td>
              <td>{defaultNode.host}</td>
              <td>{defaultNode.port}</td>
              <td>{defaultNode.method}</td>
              <td>{defaultNode.credentialMode}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
