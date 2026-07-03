package com.example.demo.common;

import org.springframework.stereotype.Service;

@Service
public class AuditLogger {
    public void recordSecurityEvent(String actor, String message) {
        // Simulated security audit trail.
    }

    public void recordDomainEvent(String message) {
        // Simulated application audit trail.
    }
}
