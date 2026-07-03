package com.example.demo.user;

import java.util.Optional;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    public boolean existsByUsername(String username) {
        return username != null && username.startsWith("known");
    }

    public Optional<String> findEmailByUsername(String username) {
        return Optional.of(username + "@example.com");
    }

    public void save(String username, String email) {
        // Simulated database persistence.
    }
}

