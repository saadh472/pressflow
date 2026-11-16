package com.pressflow;

import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PressFlowApplication {
    public static void main(String[] args) throws Exception {
        String database = System.getenv().getOrDefault("PRESSFLOW_DATABASE", "./data/pressflow.sqlite");
        Path parent = Path.of(database).toAbsolutePath().getParent();
        if (parent != null) Files.createDirectories(parent);
        SpringApplication.run(PressFlowApplication.class, args);
    }
}
