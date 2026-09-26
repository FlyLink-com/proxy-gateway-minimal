"""Production preflight using the same judgments as execution. Never deletes.

execute(apply=False) only validates a manifest and returns dry_run. This entry
requires an applicable service-role match and the same successful protection
check before returning matched. It does not consume a deletion receipt.
"""
import edge_backup_execute as execute


def preflight(document, service_report, *, observer=None, directory_bindings=None):
    if not isinstance(service_report, list) or not service_report:
        raise execute.ExecuteError('service_report_missing')
    for row in service_report:
        if not isinstance(row, dict) or row.get('result') not in execute_results():
            raise execute.ExecuteError('service_report_invalid')
    context = execute.validate_manifest(document, directory_bindings=directory_bindings)
    protection_wired = False
    if observer is not None:
        execute.check_protection(document, context['scope'], observer,
                                 expected_policy=context['protectionPolicy'])
        protection_wired = True
    applicable = [row for row in service_report if row.get('reasonCode') != 'rule_not_applicable']
    blocking = [row for row in applicable if row['result'] != 'match']
    if any(row['result'] in ('mismatch', 'unavailable') for row in blocking):
        state = 'preflight_refused'
    elif not protection_wired or not applicable or any(
            row['result'] == 'not_evaluated' for row in blocking):
        state = 'preflight_incomplete'
    else:
        state = 'preflight_matched'
    return {
        'state': state,
        'candidateCount': context['candidateCount'],
        'deletedCount': 0,
        'movedCount': 0,
        'productionObserverWired': protection_wired,
        'protectionPolicy': dict(context['protectionPolicy']),
        'blockingCount': len(blocking),
        'serviceReport': service_report,
    }


def execute_results():
    return ('match', 'mismatch', 'unavailable', 'not_evaluated')
