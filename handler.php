<?php
header('Content-Type: application/json');

switch($_SERVER['REQUEST_METHOD'])
{
	case 'GET': 
		echo file_get_contents("projectConfig.json");
		break;
	case 'POST': 
		$json = file_get_contents('php://input');
		$obj = json_decode($json, true);
		
		$newConfigFile = fopen("projectConfig.json", "w");
		fwrite($newConfigFile, json_encode($obj["newConfig"], JSON_PRETTY_PRINT));
		fclose($newConfigFile);
		echo json_encode($obj["newConfig"]);
		
		break;
	default:
		echo "{}";
}
?> 