<?php

namespace App\Enums;

enum ImportIncidentCategory: string
{
    case MailboxUnavailable = 'mailbox_unavailable';
    case StorageHeld = 'storage_held';
    case MimeInvalid = 'mime_invalid';
    case ReceiptConflict = 'receipt_conflict';
    case ReceiptInvalid = 'receipt_invalid';
    case AcknowledgementPending = 'acknowledgement_pending';
    case TemporaryFailure = 'temporary_import_failure';
}
